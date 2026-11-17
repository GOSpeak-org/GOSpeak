# 三端共享反代规则层（缩版 A）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

> **Status**（2026-11-17 更新）：**规则层与桌面接入已交付；移动端原生调用点待工具链**。Task 1 / 2 / 3 / 6 已完成；Task 4（Android 接入）与 Task 5（iOS 接入）暂缓。
>
> 暂缓原因（本机实测，非推测）：无 Xcode（`xcode-select` 指向 CommandLineTools），且无 Android SDK / NDK / JDK，因此 `gomobile bind` 两端都无法产出 AAR / XCFramework；没有产物就没有可链接的调用点，改写原生代码只会得到不可编译的实现。移动端因此**保留内联等价实现**，这是本计划 Global Constraints 明示的退路。
>
> 解除条件：具备 Xcode + Android SDK（含 NDK）+ JDK 21 的机器，跑 `node scripts/mobile-bind-proxyrules.mjs --target=all` 产出产物后，把 `LocalProxyServer.java` / `LocalProxyServer.swift` 的三个决策点改为调用绑定库。
>
> 交付核验：`app/shared/proxyrules` 单测全绿（8 个测试函数 / 73 个子测试）；`app/desktop` 全部测试零回归（10/10 host:port 用例逐字一致，255 组 worker 组合零差异）；`scripts/mobile-bind-proxyrules.mjs` 16 项单测通过并实证可拦下 gobind 静默跳过；`check-mobile-bridge` / `check-desktop-commands` 仍 in sync。

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

- [x] 创建 `app/shared/proxyrules/`（独立 Go module `gospeak/proxyrules`，go 1.26.0；**未引入 `go.work`**，避免扰动 server 1.26 与 desktop 1.27.3 的 toolchain 解析）。
- [x] 实现 `ValidateBaseURL(raw string) error`：只接受绝对 `http(s)` URL，空串视为清空。与桌面原实现逐字等价。
- [x] 实现 `RewriteSetCookie(value string) string`：去掉 `Domain=` 与 `Secure`，保留 `HttpOnly` / `Path`；处理单条含多个属性。**偏差**：SameSite 一律归一为 `SameSite=Lax`（不是「保留」）——桌面 `fixCookies` 本就强制 Lax，且去掉 Secure 后 `SameSite=None` 会被浏览器丢弃。
- [x] 实现 `IsTrustedWorker(target, baseURL, allowed string) bool`：比较归一化后的 `host:port`。**偏差**：多一个 `allowed` 参数（逗号分隔 `host:port` 列表）——只比 baseURL 会误拒后端下发的其它 worker host；用字符串而非 `[]string`，因为 gobind 会**静默跳过** `[]string` 参数且仍 exit 0。
- [x] 单测 `proxyrules_test.go`：覆盖上述边界，另加 workspace 大小写、带空格属性名、CSV 空白项等。`NormalizedHostPort` 返回 `(string, error)` 而非 `(string, bool)`（gobind 硬性要求）。

### Task 2: 桌面接入

- [x] `app/desktop/proxyserver.go` 三处内联判断改为调用 `proxyrules`；`normalizedHostPort` 私有实现删除。go.mod 用 `require` + `replace` 指向本地目录。
- [x] 跑 `cd app/desktop && go test ./...`，全部测试通过，期望值零修改（仅测试调用点换成共享函数）。
- [x] 对比改动前后输出：`NormalizedHostPort` 10/10 用例逐字一致；worker 规则 255 组组合（17 目标 × 5 baseURL × 3 白名单）零差异。

### Task 3: gomobile 工具链与产物

- [x] gomobile 经模块 `tool` 指令锁定（`gobind` + `gomobile`，版本随 `golang.org/x/mobile` 走），写入 `app/mobile/AGENTS.md`。
- [ ] **暂缓**：本机无 Xcode、无 Android SDK/NDK/JDK，两端 `gomobile bind` 均无法产出。脚本已就绪，有工具链的机器跑同一条命令即可产出。
- [~] **部分**：CI 已加绑定面校验步骤（`build-mobile`，continue-on-error，不入 gate）；产物缓存与 demo 链接验证随 AAR/XCFramework 一并暂缓。

### Task 4: Android 接入

- [ ] **暂缓**：无 AAR 可依赖，改写即不可编译。移动端保留内联等价实现。
- [ ] **暂缓**：与上一条绑定，待 AAR 接入后一并删除。
- [ ] **暂缓**：本机无 JDK，无法运行 gradle。

### Task 5: iOS 接入

- [ ] **暂缓**：无 XCFramework 可链接。
- [ ] **暂缓**：与上一条绑定。
- [ ] **暂缓**：本轮未改 Swift 源码，故 `swiftc -parse` 无新增待验内容。

### Task 6: 收尾

- [x] 更新 `app/mobile/AGENTS.md`、`packages/mobile-capabilities/AGENTS.md`、`scripts/AGENTS.md`、`app/desktop/AGENTS.md` 与根 `AGENTS.md` 的规则层说明。
- [x] 跑 `scripts/check-mobile-bridge.mjs`、`scripts/check-desktop-commands.mjs`、`scripts/mobile-bind-proxyrules.mjs` 与各包测试。
- [x] 更新本计划 Status 与 `docs/superpowers/plans/README.md`；**保留在索引中**，因 Task 4/5 仍未完成。

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
