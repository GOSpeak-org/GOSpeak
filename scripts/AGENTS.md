# scripts — 工程门禁与发布脚本

Node 原生脚本（仅用 `node:*` 内置模块，零第三方依赖）。多数是 **CI / lefthook 门禁**，改了会影响全仓。

## 文件

| 脚本 | 作用 | 门禁位置 |
|------|------|----------|
| `check-version.mjs` | 版本一致性：以 `.github/versions/*.yaml` 为单一事实源 | CI `test-scripts` / 发布 |
| `release-naming.mjs` | 产物命名规范 `gospeak-<component>-v<semver>[-os-arch][.ext]` | release 工作流 |
| `release-notes.mjs` | GitHub Release 正文（桌面下载表格 + 部署指引 + server notes） | release 工作流 |
| `build-changelog.mjs` | 按版本生成 CHANGELOG 段并幂等插入顶部 | 发版 |
| `check-ui-tokens.mjs` | UI token 护栏（任意圆角/字号/文字透明度/`ds-*`/图标尺寸） | CI lint + pre-push |
| `check-radius-tokens.mjs` | 圆角 token 专门护栏（被上面复用） | CI lint + pre-push |
| `check-hook-deps.mjs` | `useExhaustiveDependencies` 棘轮：只许减少、不许新增告警 | CI lint + pre-push |
| `check-desktop-commands.mjs` | Go `mygo.Bind` ↔ TS 命令字符串一致性 | CI lint + pre-push |
| `mobile-bind-proxyrules.mjs` | proxyrules 的 gomobile 绑定面：gobind 导出符号集合断言 + 可选 AAR/XCFramework 产出（`--surface-only` 只跑前者，供任何机器在 gate 里跑） | CI `build-mobile`（macos，不入 gate）/ CI `desktop-go`（`--surface-only`，在 gate 内）/ 手动 |
| `dev-livekit.sh` | 本地 LiveKit 开发启动（宿主机二进制 `.local/bin/livekit-server`） | 手动 |

## 约定

- **发布类脚本必须配同名 `.test.mjs`**（`build-changelog` / `check-version` / `release-naming` / `release-notes` / `check-desktop-commands`），由 `node --test` 在 CI `test-scripts` job 跑；改脚本必须同步改测试。
- `mobile-bind-proxyrules.mjs` 的单测覆盖 stderr 分类（缺 Xcode/Android SDK/NDK/JDK → exit 0）与 gobind 产物解析（`skipped function` → exit 1），由 CI `test-scripts` 的 `node --test scripts/*.test.mjs` 自动带上。
- `check-ui-tokens` / `check-radius-tokens` / `check-hook-deps` 没有单测，靠 CI 直接跑全仓扫描 —— 改它们等于改全仓门禁，先本地跑一遍再提交。
- 版本单一事实源在 `.github/versions/*.yaml`，不要在脚本里硬编码版本号。
- `check-version.mjs` 覆盖 server / desktop / mobile：mobile 以 `.github/versions/mobile.yaml` 为声明源，校验 `app/mobile/package.json`；release-naming 未定义 mobile tag，须显式传 `component=mobile`。
- `check-hook-deps.mjs` 的基线代表已存在的技术债：**下调基线需要先修掉对应告警**，不要为了过门禁放宽。
- `check-ui-tokens.mjs` 的规则对应 `packages/components/src/theme.css`；规范变更要同时改两处。
- UI 护栏的豁免要用 `biome-ignore` 并在注释里写理由，不要私自加白名单目录。
- `dev-livekit.sh` 依赖本地编译的 LiveKit 二进制，找不到时会打印编译指引。
