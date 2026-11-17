# app/desktop — 桌面宿主（Go + MyGo）

Go 1.27 + MyGo 0.8.3 原生宿主。**自带前端**（embed `webui/dist`），通过**本地回环反代**连接用户配置的服务器，页面/接口/WS 全程同源。

## 启动链（`main.go`）

1. `RequestSingleInstanceLock`：第二实例把命令行交给已运行实例后退出。
2. `mygo.Bind(...)` × 11：Window / Tray / Notification / AutoStart / DeepLink / Dialog / Clipboard / Updater / Overlay / ServerConfig / ClientLog —— 每个导出方法都会变成 TS 侧 `"<Struct>.<Method>"` 命令。
3. `registerDeepLink()`（`gospeak://invite/d/<CODE>`，必须在 Run 之前）。
4. `WhenReady`：`initHostLog` → `loadServerConfig` → release 下 `ensureProxyStarted` → `openMainWindow`。

## 窗口与页面

`windows.go`：`TitleBarStyle: mygo.TitleBarHidden` + 高度 28px（与 Web 自绘标题栏对齐，见 `app/web/src/components/titleBar/`）。dev 直连 `http://localhost:3000`（HMR）；release 加载回环代理地址。

## 回环反代（`proxyserver.go`）

- 同源托管内嵌前端，代理 `/api/v1`、`/uploads`、`/livekit`、`/ws` 到用户配置的 base URL。
- `/wsworker?target=<ws-url>` 转发到 SFU/信令 worker，**目标受 allowlist 限制**（只允许信任后端下发的 host）；`stripWorkerCookies` 防凭据外泄。
- `/healthz` 暴露端口与上游错误，供看门狗与崩溃窗使用；`recordUpstreamError` 分类记录。
- WS upgrade 有专门的 round tripper 与超时处理，改动容易把 `/ws` 打成 502。
- 三类纯规则（服务器地址校验、`Set-Cookie` 改写、worker 白名单归一）实现在 `app/shared/proxyrules`，桌面只是调用方。改规则去那里改，并跑 `cd app/shared/proxyrules && go test ./...`；桌面侧对应测试（`TestValidateBaseURL`、`TestNormalizedHostPort`、`TestWorker*`）会验证行为未漂移。

## 自愈

`supervisor.go`（重启预算与退避）、`crashwindow.go`（页面加载失败/渲染进程崩溃的独立崩溃窗）、`watchMainWindowFailures` 把失败映射成 supervisor 事件。

## 其余能力

`overlay*` 原生覆盖层（Panel + 原生重绘）、`tray.go`、`autostart.go`、`notification.go`、`dialog.go`、`clipboard.go`、`updater.go`、`deeplink.go`、`server_config.go`、`clientlog.go` + `preload_*.js`。

## 构建

```bash
pnpm --filter @gospeak/desktop-app dev     # mygo dev（GOSPEAK_DESKTOP_DEV=1 走 Vite）
pnpm --filter @gospeak/desktop-app build   # mygo build（打包）
```

`mygo.config.ts` 的 `buildCommand` 先做 `GOSPEAK_TARGET=desktop` 前端构建，再同步到 `webui/dist` 并生成 `.gz` 边车（宿主直接发预压缩字节）。

## 约束

- `mygo.ts` 由 `mygo generate` 生成且被 gitignore，**不要手改或提交**。
- 绑定方法与 `packages/desktop` 的命令字符串必须逐字一致，`scripts/check-desktop-commands.mjs` 会拦。
- 版本号与 `.github/versions/desktop.yaml` 同步（release CI 用 ldflags 覆盖）。
- 新增能力记得同时补 `packages/desktop/src/capabilities/` 的 fallback。
