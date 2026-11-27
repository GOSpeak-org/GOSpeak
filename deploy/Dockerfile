# syntax=docker/dockerfile:1
#
# GOSpeak 服务端镜像：前端在镜像内**从源码构建**并内嵌进 Go 二进制。
#
# 构建上下文＝仓库根（不是 deploy/，也不是 server/server/）：
#   docker build -f deploy/Dockerfile -t gospeak:local .
#   docker buildx build -f deploy/Dockerfile --platform linux/amd64,linux/arm64 .
#
# 流程：pnpm 安装依赖 → 构建 @gospeak/web（GOSPEAK_TARGET=web）→ dist 同步到
# server/server/internal/webui/dist（go:embed）→ 在 server/server 模块内 go build
# → 最小运行镜像。前端不再从 web 端 Release 下载 web-dist.tar.gz，
# 因此没有 CLIENT_WEB_URL / CLIENT_WEB_SHA256 构建参数。

# ── 前端构建 ────────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder
WORKDIR /src

# pnpm 版本由根 package.json 的 packageManager 固定（10.11.0）
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# 先只拷 workspace 清单，让依赖层可缓存（lockfile 是全仓唯一一份）
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY client/web/package.json ./client/web/package.json
COPY client/desktop/package.json ./client/desktop/package.json
COPY client/mobile/package.json ./client/mobile/package.json
COPY client/packages ./client/packages
COPY client/plugins ./client/plugins
COPY packages ./packages
COPY server/server/package.json ./server/server/package.json
COPY server/test/package.json ./server/test/package.json
COPY docs/package.json ./docs/package.json
# 容器内没有 .git：根 package.json 的 prepare 会跑 lefthook install 并失败，
# 因此跳过生命周期脚本，只显式重建真正需要的原生依赖（esbuild）。
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild esbuild

# 前端源码与共享包源码（@gospeak/components 等经 workspace 解析）
COPY client/web ./client/web
RUN GOSPEAK_TARGET=web pnpm --filter @gospeak/web build

# ── Go 构建（前端产物内嵌）──────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS go-builder
# Go 模块在 server/server 层级，构建工作目录也放在这里
WORKDIR /src/server/server
ARG TARGETARCH
ARG VERSION=dev
ARG COMMIT=unknown

COPY server/server/go.mod server/server/go.sum ./
RUN go mod download
COPY server/server ./

# 源码里的 dist 只有 EMBED_PLACEHOLDER，先清空再放入真实前端产物
RUN rm -rf ./internal/webui/dist
COPY --from=web-builder /src/client/web/dist ./internal/webui/dist
RUN test -f ./internal/webui/dist/index.html

# 交叉编译单二进制；版本/提交由 ldflags 注入（Release 构建传入对应 build-arg）
RUN CGO_ENABLED=0 GOOS=linux GOARCH="$TARGETARCH" go build -trimpath \
      -ldflags="-s -w -X GOSpeak/internal/buildinfo.Version=${VERSION} -X GOSpeak/internal/buildinfo.Commit=${COMMIT}" \
      -o /gospeak main.go

# ── 运行镜像 ────────────────────────────────────────────────────────────────
FROM alpine:3.21
ARG VERSION=dev
ARG COMMIT=unknown
RUN apk add --no-cache ca-certificates tzdata wget \
    && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=go-builder /gospeak /app/gospeak
# 文件兜底：即使外部跳过了 ldflags 注入，buildinfo 也能读到版本信息
RUN printf '%s\n' "${VERSION}" > /app/VERSION \
    && printf '%s\n' "${COMMIT}" > /app/COMMIT
RUN mkdir -p /app/db /app/logs /app/uploads /app/nats \
    && chown -R app:app /app

ENV PATH=/app/plugins/runtime/bin:$PATH
ENV GIN_MODE=release
ENV SERVER_PORT=8998
ENV DB_PATH=/app/db/app.db
ENV NATS_STORE_DIR=/app/nats
EXPOSE 8998
VOLUME ["/app/db", "/app/logs", "/app/uploads", "/app/nats"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8998/ping || exit 1
USER app
ENTRYPOINT ["/app/gospeak", "server", "-e", "prod"]
