# GOSpeak Monorepo — Agent 开发指南

> 本仓库是 **monorepo 根**：单仓、单 pnpm workspace、单 `pnpm-lock.yaml`、一套 turbo / biome / lefthook 工具链。
> 本文件只写约束与指针；精确清单（路由、事件、环境变量）去代码和「单一事实源」文件里读。

## 1. 目录

```
GOSpeak/                     ← monorepo 根，唯一 workspace 根
├── package.json             ← 根脚本 + 工具链依赖（turbo / biome / lefthook / commitlint）
├── pnpm-workspace.yaml      ← workspace 成员清单
├── turbo.json biome.json lefthook.yml commitlint.config.js .npmrc
├── pnpm-lock.yaml           ← 全仓唯一锁文件
├── client/                  web · packages/* · plugins/* · desktop · mobile · proxyrules · scripts
├── packages/                （空，新包预留位；共享包仍在 client/packages）
├── server/                  server（Go）· test · docs · scripts
├── deploy/                  compose · Caddy · LiveKit · 可观测 · init.sh
└── docs/                    VitePress 文档站
```

## 2. 硬约束

- **只有根有 workspace 根**：不得在 `client/` `server/` `docs/` 下新建 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、根级 `package.json`、`turbo.json`、`biome.json`、`lefthook.yml`。要改就改根上那一份。
- **目录名固定**：根上 `packages/` `deploy/` `docs/` 与 `client/` `server/`，脚本、Go 配置与 CI 都按这些路径写死，不要重命名或搬回子目录。
- **共享包在 `client/packages/`**：`client/web` 引用共享包用 workspace 名（`@gospeak/*`），纯路径引用写 `../packages/...`（相对 `client/`）、`../../packages/...`（相对 `client/web`）。
- **根 `packages/` 是新包空位**：目前只有 `.gitkeep`，不给老包用。以后新建的包丢进根 `packages/` 会自动进 workspace 与 biome 覆盖；它不是 client 共享包的第二个家。
- **`deploy/` 在仓根**：Go 端 `config.LoadEnvFiles` 从工作目录逐级向上找 `<dir>/deploy/.env`，所以 `deploy/.env` 只能呆在仓根。
- **子目录脚本带 cwd 假设**：`client/scripts/*.mjs` 以 `client/` 为工作目录 → 根脚本一律 `cd client && node scripts/...`。
- **两个 Go 模块**：`server/server`（后端，module `GOSpeak`）与 `client/proxyrules`，各自 `go.mod`，互不 import。
- **版本文件**：`server/VERSION` 由 `internal/buildinfo` 从 `.` 或 `../` 读取；不动路径就别动这个文件的位置。

## 3. 常用命令（全部在仓库根执行）

| 命令 | 作用 |
|---|---|
| `pnpm install` | 装全部 workspace 包（唯一的锁文件在这里生成） |
| `pnpm dev` | 后端 + Web 一起起 |
| `pnpm dev:web` / `pnpm dev:server` / `pnpm dev:docs` | 单端起 |
| `pnpm build` | turbo 全量构建（server / web / docs / desktop…） |
| `pnpm test` | turbo 全量测试 |
| `pnpm typecheck` | 全量 tsc |
| `pnpm lint` / `pnpm check` | biome 检查 |
| `pnpm gen:protocol` | `internal/protocol` → `client/web/src/protocol/generated` |
| `pnpm check:protocol` `check:hook-deps` `check:tokens` `check:desktop` `check:mobile` `check:proxyrules` | 各契约门禁 |
| `pnpm --filter @gospeak/docs dev` | 文档站本地预览 |

## 4. 门禁

- **lefthook**（`pnpm install` 时自动 install）：pre-commit 跑 biome check + `go vet`；commit-msg 跑 commitlint；pre-push 跑 biome ci、五个契约脚本与 `pnpm typecheck`。
- **CI**：`.github/workflows/ci.yml`，与本地同源命令。
- **改协议必须成对**：改 `server/server/internal/protocol` 后跑 `pnpm gen:protocol`，并把生成结果一起提交，否则 `check:protocol` 失败。

## 5. 发版（与 CI 解耦）

- **版本真源**：`.github/versions/<component>.yaml`（`version` + `notes`），四端独立发版；一致性由 `scripts/release/check-version.mjs` 校验。
- **链路**：改 yaml → 合入 `release` → `version-bump.yml` 对账打 tag（`gospeak-<c>-v<ver>`）→ `workflow_call` `release.yml` 构建发布该端 Release（`--latest=false`）与 `docker.yml` 推镜像。
- **聚合页**：每次发布后 `aggregate` job 重建主仓按日期聚合 Release `GOSpeak-YYMMDD`（占住 `/releases/latest`），三张表（桌面/移动/服务端）直链到各端资产。
- **脚本**：发版相关一切都在根 `scripts/release/`（命名 / 版本校验 / CHANGELOG / Release 正文 / 聚合页），旧副本已删除；门禁 `node --test "scripts/release/*.test.mjs"` 已在 CI 与 pre-push。
- **变更日志**：`server/CHANGELOG.md`、`client/{web,desktop,mobile}/CHANGELOG.md`，由 `build-changelog.mjs` 幂等写入，1.x 历史留在旧仓 Release。

## 6. 指针

- 服务端模块约定：`server/server/AGENTS.md`；插件运行层：`server/server/internal/plugin/AGENTS.md`
- 前端：`client/web/AGENTS.md`；客户端脚本门禁：`client/scripts/AGENTS.md`
- 文档站：`docs/AGENTS.md`
- 部署：`deploy/DEPLOY.md`
- 设计与实施档案：`server/docs/superpowers/`
