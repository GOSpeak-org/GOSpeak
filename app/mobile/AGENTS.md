# app/mobile — 移动宿主（Capacitor）

Capacitor 8 原生壳。**不自带前端**：加载 `app/web` 的 mobile 目标产物（`GOSPEAK_TARGET=mobile` → `app/web/dist-mobile`）。

## 构建链

1. `pnpm --filter @gospeak/web build:mobile` 产出 `app/web/dist-mobile`。
2. `cap sync` 把产物拷进 `ios/`、`android/` 并安装原生插件。
3. dev：设 `GOSPEAK_MOBILE_DEV_URL=http://<局域网IP>:3000` 走真机热重载；release：加载内嵌 bundle。

```bash
pnpm --filter @gospeak/mobile sync          # 构建 + 同步两端
pnpm --filter @gospeak/mobile run:ios       # 同步后跑 iOS
pnpm --filter @gospeak/mobile run:android   # 同步后跑 Android
```

## 原生工程

- `ios/App/App/Info.plist`：`UIBackgroundModes: audio`、`NSMicrophoneUsageDescription`、`gospeak` URL scheme。**删掉任一项都会导致后台静音或深链失效**。
- `android/.../AndroidManifest.xml`：`RECORD_AUDIO`、`FOREGROUND_SERVICE_MICROPHONE`、`POST_NOTIFICATIONS` 与 `gospeak` intent-filter。
- 自定义插件：`AudioSessionPlugin`（会话 + 路由）、`MediaControlPlugin`（锁屏通知）、`ServerConfigPlugin`（服务器地址 + 反代目标），须在 `MainActivity.onCreate` 里 `registerPlugin`；`LocalProxyServer` 必须在 `super.onCreate` 前启动。
- `assets/icon.png`：品牌图标源（1024×1024，取自 `app/desktop/resources/icon.png`）。`cap sync` 会据此重建两端 launcher icon；删掉会退回 Capacitor 默认蓝色占位图。
- `android/app/src/debug/AndroidManifest.xml`：**仅 debug 变体**放行明文 HTTP，供 dev 连局域网 `http://<开发机IP>:3000`；release 不合并该文件。
- `Info.plist` 的 `NSAppTransportSecurity/NSAllowsLocalNetworking` 同理只放行本地网络，未使用 `NSAllowsArbitraryLoads`。
- 安全区：`viewport-fit=cover` + `#app` 的 `env(safe-area-inset-*)` 内缩，`contentInset` 保持 `never` 以免双重留白。
- 键盘：`plugins.Keyboard.resize: native`（iOS 默认值）——**必须装 `@capacitor/keyboard`**，否则 WKWebView 不缩放、键盘直接盖住底部输入框；`autoBackdropColor: auto` 让键盘底部留白跟随主题。

## 约束

- 原生插件方法名与 `@gospeak/mobile-capabilities` 的 `pluginMethod()` 必须逐字一致，`scripts/check-mobile-bridge.mjs` 会拦。
- 改 `app/web` 后要重跑 `build:mobile` + `cap sync`，否则真机看到的是旧包。
- 服务器地址在登录页填：移动端与桌面端一样内置本地反代（Android/iOS 的 `LocalProxyServer`），在 `47900-47919` 内挑选可用端口并持久化，WebView 地址由原生层在启动时注入，始终同源；反代托管前端并转发 `/api/v1`、`/uploads`、`/livekit`、`/ws`、`/wsworker` 到配置的服务器，地址由 `ServerConfig` 插件持久化，切换后原生 reload。
- 移动产物在 `app/web/dist-mobile`（与 `dist` 平级）：Vite 会清空自己的 outDir，放进 `dist/` 里会被一次 web 构建删掉。
- 后台音频成立与否由真机 PoC 结论决定，见 `agent_test_logs/` 记录。
