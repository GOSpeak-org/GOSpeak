# scripts — 工程门禁与开发脚本（服务端）

Node 原生脚本（仅用 `node:*` 内置模块，零第三方依赖）。多数是 **CI / lefthook 门禁**，改了会影响全仓。

> **发版脚本已收敛到仓库根 `scripts/release/`**：`release-naming.mjs`、`check-version.mjs`、`build-changelog.mjs`、`release-notes.mjs`、`render-aggregate.mjs`（含各自 `.test.mjs`）。本目录只保留服务端自己的门禁与开发脚本，不再有发布脚本副本。

## 文件

| 脚本 | 作用 | 门禁位置 |
|------|------|----------|
| `check-proxyrules-sync.mjs` | 服务端 `server/server/internal/plugin/proxyrules/` 副本 ↔ 源实现逐字节一致（sha256）；`--fix` 用源实现覆盖副本 | CI `proxyrules-sync` job（gate 必过） |
| `dev-livekit.sh` | 本地 LiveKit 开发启动（宿主机二进制 `.local/bin/livekit-server`） | 手动 |

## 约定

- **发布相关的一切都不在这里**：tag 命名、四端版本校验、CHANGELOG 段、Release 正文、聚合页一律改根 `scripts/release/`，并同步改那边的 `.test.mjs`（`node --test scripts/release/` 必须全绿）。
- `proxyrules` 在服务端是**副本**，源实现在本仓 `client/proxyrules`。改规则只改源实现，再用 `node server/scripts/check-proxyrules-sync.mjs --fix` 覆盖副本；不要直接改副本（CI 会红）。脚本默认读本仓源实现直接比对、不走网络；只有显式传 `--repo owner/repo [--ref]` 时才回退到远端拉取作参照。
- 版本单一事实源在 `.github/versions/*.yaml`，不要在脚本里硬编码版本号；跨端一致性由 `scripts/release/check-version.mjs` 校验（`server` 组件对 `server/VERSION` 与 `server/server/package.json`）。
- 前端与客户端门禁（UI token / 圆角 / hook-deps / 桌面桥 / 移动桥 / gomobile 绑定）都在 `client/scripts/`，本目录不维护。
- `dev-livekit.sh` 依赖本地编译的 LiveKit 二进制，找不到时会打印编译指引。
