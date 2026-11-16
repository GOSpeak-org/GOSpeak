# ── Stage 1: Frontend SPA ────────────────────────────────────────────────
# 固定在构建机平台上执行：多架构构建时 arm64 目标若在这里跑 pnpm install，
# 整个依赖安装会被 QEMU 拖到一小时以上（1.0.3 镜像即卡在这一步）。
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY app/web/package.json app/web/
COPY packages/components/package.json packages/components/
COPY packages/desktop/package.json packages/desktop/
COPY packages/sfu-client/package.json packages/sfu-client/
COPY packages/mobile-capabilities/package.json packages/mobile-capabilities/
# `prepare` 含 lefthook install，依赖 git，Docker 内无需执行
RUN pnpm install --frozen-lockfile --filter @gospeak/web... --ignore-scripts
COPY app/web app/web
COPY packages/components packages/components
COPY packages/desktop packages/desktop
COPY packages/sfu-client packages/sfu-client
COPY packages/mobile-capabilities packages/mobile-capabilities
RUN pnpm --filter @gospeak/web build

# ── Stage 2: Go backend (embed frontend) ─────────────────────────────────
# 同样在构建机平台上执行，用 GOARCH 交叉编译；纯 Go、CGO 关闭，无需模拟。
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS go-builder
WORKDIR /build
ARG TARGETARCH
ARG VERSION=dev
ARG COMMIT=unknown

COPY app/server/go.mod app/server/go.sum ./
RUN go mod download
COPY app/server/ ./
# VERSION 是版本权威来源；未传 build-arg 时运行期回退读取该文件
COPY VERSION ./
# 将前端产物同步到 go:embed 目录，打进二进制
COPY --from=web-builder /src/app/web/dist/ ./internal/webui/dist/
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -ldflags="-s -w -X 'GOSpeak/internal/buildinfo.Version=${VERSION}' -X 'GOSpeak/internal/buildinfo.Commit=${COMMIT}'" -o /gospeak .

# ── Stage 3: Production ──────────────────────────────────────────────────
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata wget \
    && addgroup -S app && adduser -S -G app app

WORKDIR /app

COPY --from=go-builder /gospeak /app/gospeak
COPY --from=go-builder /build/VERSION /app/VERSION

RUN mkdir -p /app/db /app/logs /app/uploads /app/nats \
    && chown -R app:app /app

ENV GIN_MODE=release
ENV SERVER_PORT=8998
ENV DB_PATH=/app/db/app.db
# 内嵌 NATS JetStream 的持久化目录：JWT 签名密钥 / 黑名单 / refresh-family 落在这里，
# 跨重启保留。必须挂卷（compose 已挂 gospeak-nats），否则视为临时数据。
ENV NATS_STORE_DIR=/app/nats

EXPOSE 8998

VOLUME ["/app/db", "/app/logs", "/app/uploads", "/app/nats"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8998/ping || exit 1

USER app

# 运行时配置走 env_file / 环境变量，不把密钥打进镜像
ENTRYPOINT ["/app/gospeak", "server", "-e", "prod"]
