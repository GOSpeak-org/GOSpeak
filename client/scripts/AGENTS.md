# scripts — 工程门禁（客户端）

Node 原生脚本（仅用 `node:*` 内置模块，零第三方依赖）。多数是 **CI / lefthook 门禁**，改了会影响全仓。

> **发版脚本已收敛到仓库根 `scripts/release/`**：`release-naming.mjs`、`check-version.mjs`、`build-changelog.mjs`、`release-notes.mjs`、`render-aggregate.mjs`（含各自 `.test.mjs`）。本目录不再保留 `release-naming` 等发布脚本副本。

## 文件

| 脚本 | 作用 | 门禁位置 |
|------|------|----------|
| `check-ui-tokens.mjs` | UI token 护栏（任意圆角/字号/文字透明度/`ds-*`/图标尺寸） | CI lint + pre-push |
| `check-radius-tokens.mjs` | 圆角 token 专门护栏（被上面复用） | CI lint + pre-push |
| `check-hook-deps.mjs` | `useExhaustiveDependencies` 棘轮：只许减少、不许新增告警 | CI lint + pre-push |
| `check-desktop-commands.mjs` | Go `mygo.Bind` ↔ TS 命令字符串一致性 | CI lint + pre-push |
| `check-mobile-bridge.mjs` | 移动端**自定义原生插件**（AudioSession / MediaControl / ServerConfig）的 TS `pluginMethod` ↔ iOS / Android 方法名与插件注册一致性；官方 Capacitor 插件不在范围 | CI lint + pre-push |
| `check-protocol-sync.mjs` | `server/server/internal/protocol` 与 `client/web/src/protocol/generated` 生成物一致（改协议必须 `pnpm gen:protocol`） | CI lint + pre-push |
| `mobile-bind-proxyrules.mjs` | proxyrules 的 gomobile 绑定面：gobind 导出符号集合断言 + 可选 AAR/XCFramework 产出（`--surface-only` 只跑前者，供任何机器在 gate 里跑） | `build-mobile.yml`（ubuntu，按 tag 编排；不入 CI gate）/ CI `desktop-go`（`--surface-only`，在 gate 内）/ 手动 |
| `mobile-version.mjs` | 把 `.github/versions/mobile.yaml` 同步进移动端原生工程；`--check` 只比对不写入 | 发版 / 版本门禁 |

## 约定

- **发布类脚本不在这里**：tag 命名、四端版本校验、CHANGELOG 段、Release 正文、聚合页一律改根 `scripts/release/`，并同步改那边的 `.test.mjs`（`node --test scripts/release/` 必须全绿）。
- **`mobile-version.mjs` 的仓库根是「向上探测」出来的**，不是脚本目录的上一级：从 `process.cwd()` 逐级向上找同时含 `.github/versions/mobile.yaml` 与 `pnpm-workspace.yaml` 的目录。语义：
  - 声明源只有仓库根 `.github/versions/mobile.yaml`；
  - 只同步 mobile 自身的副本 —— `client/mobile/package.json`、Android `app/build.gradle`（`versionName` + `versionCode`）、iOS `project.pbxproj`（`MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`）；
  - **不写 `client/web` 下任何文件**（Web 版本由 `.github/versions/web.yaml` 独立管理）；
  - `--check` 只比对不落盘，漂移时按文件逐条报 `::error::` 并退出 1。
- `mobile-bind-proxyrules.mjs` 的单测覆盖 stderr 分类（缺 Xcode/Android SDK/NDK/JDK → exit 0）与 gobind 产物解析（`skipped function` → exit 1），由 CI `test-scripts` 的 `node --test scripts/*.test.mjs` 自动带上。
- `check-mobile-bridge.mjs` 只校验仓库自有的 3 个自定义原生插件（AudioSession / MediaControl / ServerConfig）；push / keyboard / local-notification / deeplink / back-button / lifecycle 走官方 Capacitor 插件，不在校验范围，本地没有原生实现可比对。要校验就必须先在 `client/mobile` 落地原生实现，**不要**为了让门禁显得更全面而扩白名单。其单测 `check-mobile-bridge.test.mjs` 在 CI `lint` 里随脚本一起跑。
- `check-radius-tokens` / `check-hook-deps` 没有单测，靠 CI 直接跑全仓扫描 —— 改它们等于改全仓门禁，先本地跑一遍再提交。`check-ui-tokens` 已有 `check-ui-tokens.test.mjs`（覆盖裸圆角/CSS 字面量圆角/斜杠行高字号/任意属性顺序图标尺寸与误报），改门禁时须同步补测试。
- 版本单一事实源在 `.github/versions/*.yaml`，不要在脚本里硬编码版本号；跨端一致性由根 `scripts/release/check-version.mjs` 校验（mobile 对 `client/mobile/package.json`、Android `build.gradle`、iOS `project.pbxproj`）。
- `check-hook-deps.mjs` 的基线代表已存在的技术债：**下调基线需要先修掉对应告警**，不要为了过门禁放宽。
- `check-ui-tokens.mjs` 的规则对应 `client/packages/components/src/theme.css`；规范变更要同时改两处。
- UI 护栏的豁免要用 `biome-ignore` 并在注释里写理由，不要私自加白名单目录。
- 本地 LiveKit 开发启动脚本在 `server/scripts/dev-livekit.sh`，不在本目录。
