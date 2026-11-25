# 三端目录拆分为 Git Submodule 设计

## 意图与原因

`app/web`（React 前端）、`app/desktop`（Go + MyGo 桌面宿主）、`app/mobile`（Capacitor 移动壳）当前与主仓库同仓开发。随着三端各自独立演进，需要把它们拆成独立 Git 仓库，通过 submodule 接入主仓库，使各端可以独立打 tag、独立 review、独立发布，同时保持同一套代码与工具链不变。

## 目标

- 三个目录以 submodule 形式存在于相同路径：`app/web`、`app/desktop`、`app/mobile`。
- 每个 submodule 保留该目录在主仓库中的完整 Git 历史。
- 主仓库 HEAD 仅记录三个 submodule 的 commit 指针（gitlink），不再跟踪目录内文件。
- 所有现有构建、lint、typecheck、CI 脚本在 submodule checkout 后继续工作，路径不变。
- 给出清晰、可回滚的执行步骤。

## 非目标

- 不把 `packages/components`、`packages/sfu-client`、`packages/desktop`、`packages/mobile-capabilities` 拆成 submodule；它们继续作为 workspace 包留在主仓库。
- 不改动三端业务代码、构建配置、UI token、协议生成逻辑。
- 不改动服务端 `app/server`、`internal/*` 分层与路由。
- 不切换分支策略，仍按 `release` 为唯一事实源。

## 反目标（做什么会导致失败）

- 丢失三个目录的历史。
- submodule 路径改变（例如改成 `modules/web`），导致 Vite / Turbo / CI / AGENTS.md 中大量路径失效。
- 主仓库同时以普通目录和 submodule 形式跟踪同一路径，产生 git index 冲突。
- 未处理当前工作区未提交改动就直接拆分，导致 `app/web` 内改动丢失。
- 拆分后未跑 `pnpm typecheck`、`pnpm lint`、三目标构建与 Go 构建，导致 CI 回归。

## 约束

- 当前工作目录：`/Users/noelorin/Projects/GOSpeak`，当前分支 `dev-1124`，主仓库远端 `https://github.com/NoelOrin/GOSpeak.git`。
- 当前工作区有大量未提交改动，其中 `app/web/src/...` 有多个修改；拆分前必须显式决定这些改动的归属与落点。
- 仓库规范：Conventional Commits；分支从最新 `origin/release` 签出；文档与代码同 PR 更新；不留过期文档。
- 子仓库默认命名：
  - `https://github.com/NoelOrin/GOSpeak-Web.git`
  - `https://github.com/NoelOrin/GOSpeak-Desktop.git`
  - `https://github.com/NoelOrin/GOSpeak-Mobile.git`
- 执行工具建议：`git filter-repo`（若本机未安装则退化为 `git subtree split` + 手工清理历史）。
- `git filter-repo` 会重写历史，**只能在临时 clone 中运行**，绝不直接在主仓库工作区运行。

## 方案

### 采用的方案：filter-repo 抽取历史 + 原地 submodule

对每个目录重复：

1. 从主仓库做一个临时裸 clone 或普通 clone。
2. 在该 clone 中用 `git filter-repo --path <dir> --to-subdirectory-filter <dir>` 把历史裁剪为该目录，并把目录内容提升到子仓库根（也可保留目录层级，见「决策点」）。
3. 推送到对应远端仓库的 `release` 分支。
4. 在主仓库工作区：先处理未提交改动，再 `git rm -r --cached <dir>`，删除本地目录内容，`git submodule add -b release <remote> <dir>`。
5. 提交主仓库的 `.gitmodules` 与 gitlink 变更。

### 为什么不用其他方案

- **空仓库快照**：最快，但丢失三个目录历史，不符合需求。
- **本地相对路径 submodule**：适合临时验证，但不适合团队协作与 CI，不能作为目标方案。

## 决策点（执行前由维护者确认）

1. 子仓库内目录结构：
   - **推荐 A1**：子仓库根就是原目录内容（例如 `GOSpeak-Web/src/...` 对应主仓库 `app/web/src/...`）。执行时用 `--to-subdirectory-filter` 的反向策略或 `--path app/web` 后移动内容到根。
   - **A2**：子仓库保留原目录层级（`GOSpeak-Mono/app/web/...`），主仓库 submodule 路径仍为 `app/web`，但子仓库根目录多一层 `app/web`。不推荐，会让子仓库独立开发体验变差。
2. 当前未提交改动处理：
   - **推荐 B1**：把 `app/web` 的未提交改动先在主仓库当前分支提交（按 Conventional Commits），再执行拆分；拆分时该提交会进入子仓库历史。
   - **B2**：把未提交改动 stash，拆分后在子仓库中 reapply。风险是 stash 与主仓库历史分叉，操作更复杂。
3. 子仓库默认分支：推荐 `release`，与主仓库一致。

## 关键风险与缓解

- 历史抽取耗时/体积大：先在临时 clone 中执行；若 `filter-repo` 不可用，用 `git subtree split` 作为退路，接受历史提交信息变化。
- 主仓库 index 冲突：先 `git rm -r --cached` 再 `submodule add`，不要混用。
- CI / 工具链路径失效：submodule 路径与原目录一致，理论上无需改路径；但仍需跑全量门禁验证。
- 当前工作区改动丢失：执行前先 `git status --short` 与 `git diff` 存档，按决策点提交或 stash。
- `git filter-repo` 未安装：允许通过 `python3 -m pip install git-filter-repo` 或 Homebrew 安装；若环境不允许，改用 subtree split 并在计划中标注历史等价性降低。

## 留给执行者

- 确认决策点 1/2/3。
- 在 GitHub 上创建三个空仓库（或提供已存在的空仓库地址）。
- 使用 `superpowers:writing-plans` 生成的计划逐步执行。
