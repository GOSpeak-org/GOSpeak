# packages/mobile-capabilities — 移动能力 SDK

`@gospeak/mobile-capabilities`：`@gospeak/web` 与原生宿主（`app/mobile`，Capacitor 8）之间的 TS 桥接。**每个能力都有原生实现 + Web 安全降级**，同一份组件代码在浏览器与原生壳里都能跑。模式对齐 `packages/desktop`。

## 结构

| 文件 | 职责 |
|------|------|
| `conditional.ts` | `BUILD_TARGET` `MOBILE_BUILD` `WEB_BUILD` `inMobile()` `assertMobile` `ifMobile` `importMobile` |
| `bridge.ts` | `pluginMethod` / `getPlugin` / `listenPlugin`，动态加载 `@capacitor/core` |
| `capabilities/*` | audio-session / audio-route / media-control / push / deeplink / lifecycle / local-notification |
| `index.ts` | 具名导出 + `createMobile()` 聚合对象 |

## 条件编译

`GOSPEAK_TARGET=mobile` 时 Vite 注入 `__GOSPEAK_MOBILE__=true`。

- 业务代码判定平台**一律用 `inMobile()`**；模块级裁剪写 `if (__GOSPEAK_MOBILE__)`。
- `@capacitor/core` 只在 `__GOSPEAK_MOBILE__` 分支内动态 import，web/desktop 构建整段被剔除。

## 桥接契约

- TS 侧 `pluginMethod("Plugin", "method")` 必须与原生 `@CapacitorPlugin(name=)` / `CAPPluginMethod(name:)` / `@PluginMethod fun` 逐字一致。
- `scripts/check-mobile-bridge.mjs` 在 CI 与 pre-push 校验，写错会在运行期得到 "not implemented"。

## 约定

- 新增能力：`capabilities/<name>.ts` 导出 `create<Name>()`，内部同时实现 native 与 fallback，并在 `index.ts` 导出（加入 `createMobile()`）。
- 降级必须**无副作用且可调用**，不要抛异常让调用方崩；失败要有明确返回值或 `console.warn`。
- `local-notification` 是设备本地通知（被踢/断连等本地事件），**不能替代服务端推送**；离线时别人邀请你仍需要 APNs/FCM 服务端链路。
