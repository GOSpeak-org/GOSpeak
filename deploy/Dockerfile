# syntax=docker/dockerfile:1
#
# GOSpeak 服务端镜像：前端在镜像内**从源码构建**并内嵌进 Go 二进制。
# 构建上下文＝仓库根（需 `git submodule update --init --recursive`）：
#   docker build -f deploy/Dockerfile -t gospeak:local .
#
# 注意：client/ 是独立 workspace（自带 pnpm-workspace.yaml + 锁文件），
# 根 workspace 只覆盖 packages/，所以前端依赖必须 `cd client && pnpm install`。

# ── 前端构建 ────────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder
WORKDIR /src

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# 先只拷 client workspace 的清单，让依赖层可缓存
COPY client/package.json client/pnpm-workspace.yaml client/pnpm-lock.yaml ./client/
COPY client/web/package.json ./client/web/package.json
COPY client/desktop/package.json ./client/desktop/package.json
COPY client/mobile/package.json ./client/mobile/package.json
COPY client/packages ./client/packages
COPY client/plugins ./client/plugins

# 容器内没有 .git：跳过生命周期脚本，只重建原生依赖（esbuild）
RUN cd client && pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY client/web ./client/web
RUN cd client && GOSPEAK_TARGET=web pnpm --filter @gospeak/web build \
    && test -f /src/client/web/dist/index.html

# ── Go 构建（前端产物内嵌）──────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS go-builder
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
