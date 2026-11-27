# GOSpeak Monorepo — Agent 开发指南

> **硬约束：大仓是「mono 套 submodule」。**
> `client/` `server/` `docs/` 永远是 git submodule（`.gitmodules` + gitlink 160000），
> **禁止**把它们的代码平铺进根仓、禁止改写它们的指针/历史/内容。
> 任何结构调整前先确认这三条 submodule 指针还在（`git submodule status`）。

## 1. 结构

```
GOSpeak/                     ← 根仓 = monorepo 编排层（不是应用代码仓）
├── .gitmodules              ← 三条子模块声明
├── client/ → GOSpeak-Client ← submodule（web / packages / desktop / mobile / proxyrules）
├── server/ → GOSpeak-Server ← submodule（Go 后端 + test + docs + scripts）
├── docs/   → GOSpeak-Docs   ← submodule（VitePress 站点）
├── deploy/                  ← 根自有：compose · Dockerfile · init.sh · Caddyfile · livekit · observability
├── packages/                ← 根自有：新包预留位（当前只有 .gitkeep）
├── scripts/release/         ← 根自有：四端发版脚本（命名 / 版本校验）
├── .github/versions/        ← 根自有：四端版本声明（发版单一事实源）
├── .github/workflows/       ← 根自有：CI + 发版编排
└── pnpm-workspace.yaml      ← 根 workspace **只覆盖 packages/**
```

## 2. 硬约束

- **submodule 不可平铺**：根仓不接收 `client/` `server/` `docs/` 的文件；改代码去子仓（`cd client && ...`），根仓只提交指针。
- **根 workspace 只含 `packages/*`**：不要往 `pnpm-workspace.yaml` 里加 `client/*`、`server/*`，那会在子仓里制造 `node_modules` 与锁文件漂移。
- **根只放编排层**：`deploy/`、`packages/`、`scripts/release/`、`.github/`、根工具链配置。应用代码、依赖清单、构建产物都归子仓。
- **版本真源**：`.github/versions/<component>.yaml`；派生文件在子仓里，只能只读校验（`node scripts/release/check-version.mjs .`），不手改。
- **克隆/CI 必须带子模块**：`git clone --recursive`，workflow 里 `actions/checkout` 必须 `submodules: recursive`。

## 3. 常用命令（根目录）

| 命令 | 作用 |
|---|---|
| `git submodule update --init --recursive` | 拉齐三个子仓到声明指针 |
| `git submodule status` | 看指针是否漂移（前缀 `+` 表示工作区与指针不一致） |
| `pnpm install` | 只装根 `packages/*`（很快） |
| `node scripts/release/check-version.mjs .` | 四端版本一致性校验（只读子仓） |
| `docker build -f deploy/Dockerfile .` | 构建应用镜像（上下文=仓根，需子模块已初始化） |
| `cd deploy && ./init.sh --check` | 部署配置一致性校验 |

## 4. 指针

- 服务端约定：`server/server/AGENTS.md`
- 前端：`client/web/AGENTS.md`
- 文档站：`docs/AGENTS.md`
- 部署：`deploy/AGENTS.md` · `deploy/DEPLOY.md`
