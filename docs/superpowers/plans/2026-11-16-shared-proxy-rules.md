# 三端共享反代规则层（缩版 A）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

> **Status**（2026-11-16 建立）：**未启动，后续跟进**。当前三端各自的原生反代实现正常推进，本计划只收拢其中最易错、必须一致的三类纯规则；不在本轮实施。
>
> 前置事实（本机核实）：`gomobile` 未安装；本机 Go 1.26.2，而 `app/desktop/go.mod` 声明 1.27.3、`app/server/go.mod` 声明 1.26.11；Android NDK 28.2 已装；无完整 Xcode，iOS 仅能做 `swiftc -parse`。

**Goal:** 把反代中的三类纯规则——服务器地址校验、`Set-Cookie` 改写、`/wsworker` 目标白名单——收敛为一份 Go 实现、一份 Go 测试；桌面直接调用，移动端经 gomobile 绑定调用。代理的 HTTP/WS 骨架仍由各端原生实现，不追求「一份代码跑三端」。

**Architecture:** 新增纯 Go 包 `app/shared/proxyrules`，导出只含 `string` / `bool` / `error` 的函数。桌面 `app/desktop/proxyserver.go` 直接 import；Android / iOS 用 `gomobile bind` 产出 AAR / XCFramework，在三个决策点调用。规则层无网络、无文件、无回调，因此不触碰 gomobile 的类型边界限制。

**非目标：** 不替换各端原生代理骨架；不改鉴权方式（仍用 HttpOnly Cookie）；不把 `embed.FS` 或 worker host 回调跨语言传递；不在本轮引入完整 Go 代理绑定（见「为什么不选完整 A」）。

## 为什么不选完整 A

完整 A 指把 `proxyserver.go` 整体抽成 Go 包、gomobile 绑定后让移动端直接跑 Go 代理。当前不建议：

- `embed.FS` / `fs.FS` 与 `allowedWorkerHosts func() []string` 都过不了 gomobile 绑定边界，必须重写桌面已验证的安全逻辑。
- Go 版本与工具链缺口导致产物在本机完全无法验证，用不可验证换可维护，不划算。
- iOS 无 Xcode，XCFramework 链接无法确认。

缩版 A 只共享规则，规避上述全部三点，且拿到主要收益（规则一份实现、一份测试、三端行为一致）。

## Global Constraints

- 规则函数输入输出只能是 `string` / `bool` / `error`，禁止接口、函数回调、`fs.FS`。
- 桌面端现有安全语义不得改变；白名单从「回调注入」改为「函数计算」后结果必须与现有一致。
- 移动端原生代理骨架（HTTP/WS 转发、静态资源、连接管理）保持各端独立实现，本计划不改。
- 产物接入不得阻塞当前版本交付：工具链未就绪时，移动端可先保留内联等价实现。

## Tasks

### Task 1: 纯 Go 规则包

- [ ] 创建 `app/shared/proxyrules/`，Go module 与 workspace 对齐。
- [ ] 实现 `ValidateBaseURL(raw string) error`：只接受绝对 `http(s)` URL，空串视为清空。
- [ ] 实现 `RewriteSetCookie(value string) string`：去掉 `Domain=` 与 `Secure`，保留 `HttpOnly` / `SameSite` / `Path`；处理单条含多个属性的场景。
- [ ] 实现 `IsTrustedWorker(target, baseURL string) bool`：比较归一化后的 `host:port`，只允许与配置的后端同 host:port（桌面现有策略的等价函数版）。
- [ ] 单测 `proxyrules_test.go`：覆盖多个 Set-Cookie、带端口 host、`ftp://`、缺省端口、大小写域名等边界。

### Task 2: 桌面接入

- [ ] `app/desktop/proxyserver.go` 三处内联判断改为调用 `proxyrules`。
- [ ] 跑 `cd app/desktop && go test ./...`，确认行为无回归（尤其 `proxyserver_security_test.go`）。
- [ ] 对比改动前后 `IsTrustedWorker` 与旧 `allowedWorkerHosts` 在测试用例上的输出。

### Task 3: gomobile 工具链与产物

- [ ] 安装与项目 Go 版本兼容的 gomobile，锁定版本写入文档。
- [ ] `gomobile bind -target=android` 产 AAR，`-target=ios` 产 XCFramework。
- [ ] CI 增加 bind 步骤与产物缓存；验证最小 demo 工程能链接并调用三个函数。

### Task 4: Android 接入

- [ ] gradle 依赖 AAR；三处决策点（地址校验、Set-Cookie 改写、worker 白名单）改为调用绑定库。
- [ ] 删除 `LocalProxyServer.java` 中对应的重复规则实现。
- [ ] `gradlew compileDebugJavaWithJavac` 通过。

### Task 5: iOS 接入

- [ ] XCFramework 加入 Xcode 工程；三处决策点改为调用绑定库。
- [ ] 删除 `LocalProxyServer.swift` 中对应的重复规则实现。
- [ ] 有 Xcode 的环境跑 iOS 构建验证；本机仅做 `swiftc -parse`。

### Task 6: 收尾

- [ ] 更新 `app/mobile/AGENTS.md`、`packages/mobile-capabilities/AGENTS.md` 的规则层说明。
- [ ] 跑 `scripts/check-mobile-bridge.mjs`、`pnpm typecheck`、web 与 SDK 测试。
- [ ] 更新本计划 Status 为已交付，并从 `docs/superpowers/plans/README.md` 移除或归档。

## Verification

- `cd app/shared/proxyrules && go test ./...`
- `cd app/desktop && go test ./...`
- `gradlew compileDebugJavaWithJavac`
- `xcodebuild`（需完整 Xcode）
- `node scripts/check-mobile-bridge.mjs`
- `pnpm typecheck` + web / SDK 全量测试

## 剩余风险

- gomobile 版本与 Go 1.27.x 的兼容性需实测，可能需要单独工具链。
- iOS 上 URLSession 会合并多个 `Set-Cookie`，纯函数只能改写拿到的字符串，无法还原被合并前的多条——与当前实现的限制相同，本计划不解决。
- 规则层只覆盖三类判断；HTTP/WS 转发行为仍由各端原生实现，不承诺跨端完全一致，需靠真机验收。
