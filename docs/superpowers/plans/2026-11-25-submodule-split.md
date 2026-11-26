# 多平台仓库结构调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/web`、`app/desktop`、`app/mobile` 三个目录从 GOSpeak 主仓库拆成独立 Git submodule，保留各自完整历史，路径与工具链不变；把 `web` 提升为独立发布组件，产出静态前端压缩包并与 Go 二进制一同分发，通过外部静态目录（`STATIC_DIR`）热更新（**不再嵌入二进制**）；并重构更新检测链路，server / web / desktop / mobile 四端各自去对应仓库检查 Release 版本。

**Architecture:** 在临时 clone 中用 `git filter-repo` 从主仓库历史抽取每个目录为独立仓库（子仓库根即原目录内容），推送到三个新远端仓库的 `release` 分支；主仓库处理完未提交改动后 `git rm -r --cached` 三个目录，再 `git submodule add` 回相同路径，提交 `.gitmodules` 与 gitlink。CI/发布 workflows 必须改造为 checkout with submodules，并把路径过滤器适配 gitlink 变化；版本声明改为主仓库与子仓库分层 `metadata.yaml`，版本 bump 采用「子仓库改 metadata → 主仓库更新 metadata 与 gitlink」两阶段流程；`server`、`web`、`desktop`、`mobile` 各自独立 SemVer 与 tag。前端不再 `go:embed` 进服务端/桌面二进制：服务端二进制只通过 `STATIC_DIR` / `/app/static` / `./static` 消费外部前端，发布包把前端静态压缩包与二进制一起分发；桌面宿主改为读取随安装包分发的外部前端目录。更新检测改为多仓库模型：`server` 查 GOSpeak 主仓库 `v*` tag，`web` 查 GOSpeak-Web `gospeak-web-v*`，`desktop` 查 GOSpeak-Desktop `gospeak-desktop-v*`，`mobile` 查 GOSpeak-Mobile `gospeak-mobile-v*`，各自带独立缓存与降级。`serveSPA` 对 `index.html` 补 `Cache-Control: no-store`，避免前端热更新后旧首页引用失效的 hash 资源。

**Tech Stack:** Git 2.x · git-filter-repo（或 git subtree split 退化）· GitHub · pnpm 10 · Turbo · Biome · Vitest 5 · Go 1.27 · Gin（静态托管）

**Specs:**
- `docs/superpowers/specs/2026-11-25-submodule-split-design.md`
- `docs/superpowers/specs/2026-11-25-submodule-release-design.md`（Task 9 创建，含 web 外部更新规则）

## Global Constraints

- 工作目录：`/Users/noelorin/Projects/GOSpeak`；主仓库远端：`https://github.com/NoelOrin/GOSpeak.git`；计划编写时当前分支 `dev-1124`，执行时在 `origin/release` 签出的短期工作分支上进行（本轮为 `feature/multiplatform-repo-restructure`）。
- 分支策略：从最新 `origin/release` 签出工作分支；唯一常驻分支为 `release`。
- 子仓库默认地址（可替换，但一旦确定必须全程一致）：
  - `https://github.com/NoelOrin/GOSpeak-Web.git`
  - `https://github.com/NoelOrin/GOSpeak-Desktop.git`
  - `https://github.com/NoelOrin/GOSpeak-Mobile.git`
- 子仓库默认分支：`release`。
- 子仓库结构：子仓库根即原目录内容（`src/...` 对应主仓库 `app/web/src/...`），不保留 `app/web` 这层前缀。
- `git filter-repo` 只在临时 clone 中运行，**绝不**在主仓库工作区直接运行。
- 文件沙箱为 danger-full-access；审批已禁用，不要请求 sandbox 提权。
- 代码不加注释（复杂逻辑除外）、不用 emoji；提交遵循 Conventional Commits。
- 文档与代码同 PR；计划索引只保留仍在跟进的条目。

## Review Focus

- **当前未提交改动丢失**：`app/web` 内多个已修改文件在拆分前必须有显式落点（提交或 stash），且执行 `git rm -r --cached` 前再次核对 `git status`；Task 1 用状态快照与 diff 存档钉住。
- **子仓库历史缺失**：filter-repo 后子仓库 `git log` 必须包含原目录中至少一次真实提交（非仅初始空提交）；Task 3 用 log 抽样钉住。
- **submodule 路径漂移**：主仓库 `.gitmodules` 中三个 path 必须精确为 `app/web`、`app/desktop`、`app/mobile`；Task 5 用 `git config -f .gitmodules --get-regexp path` 钉住。
- **工具链/CI 因路径变化失效**：`pnpm typecheck`、`pnpm lint`、三目标构建、`pnpm test`、Go 构建必须全部通过；Task 8 逐条验证。
- **主仓库残留跟踪文件**：`git ls-files app/web app/desktop app/mobile` 在提交后只能返回三个 gitlink（mode 160000），不能列出目录内普通文件；Task 5 钉住。
- **clone 后不可复现**：全新 clone + `git submodule update --init --recursive` 后目录内容完整；Task 8 钉住。

---

## 文件结构

**新建**

| 文件 | 职责 |
|---|---|
| `docs/superpowers/specs/2026-11-25-submodule-split-design.md` | 设计文档（已创建） |
| `docs/superpowers/plans/2026-11-25-submodule-split.md` | 本计划 |
| `docs/superpowers/specs/2026-11-25-submodule-ci-design.md` | 子仓库 CI 策略说明（Task 7） |
| `docs/superpowers/specs/2026-11-25-submodule-release-design.md` | 版本与发布规则说明（Task 9） |
| `metadata.yaml`（主仓库 + 三个子仓库各一份） | 版本与元数据的分层单一事实源（Task 9）；含 `web` 组件 |
| `scripts/metadata.mjs` + `.test.mjs` | metadata.yaml 解析与一致性校验（Task 9） |
| `.gitmodules` | 三个 submodule 的 path/url/branch 声明，由 `git submodule add` 生成 |

**修改**

| 文件 | 改动 |
|---|---|
| `docs/superpowers/plans/README.md` | 索引新增本计划条目 |
| `AGENTS.md` | 目录骨架说明三端为 submodule；单一事实源索引补一句「子仓库地址见 `.gitmodules`」 |
| `docs/superpowers/specs/2026-11-25-submodule-split-design.md` | 决策点确认后回填最终选择（如子仓库地址、未提交改动处理方式） |
| `.github/workflows/ci.yml` 等 7 个 workflow | checkout 加 submodules；路径过滤器适配 gitlink；protocol-check 调整（Task 7） |
| `scripts/check-version.mjs` + `.test.mjs` | 改读 metadata.yaml + submodule 守卫（Task 9） |
| `scripts/release-naming.mjs` + `.test.mjs` | 增加 mobile 与 web 组件（Task 9） |
| `scripts/build-changelog.mjs` / `release-notes.mjs` + 各自 test | 按组件从 metadata 生成（Task 9） |
| `.github/versions/*.yaml` | 删除，迁移到 metadata.yaml（Task 9） |
| `.github/workflows/version-bump.yml` / `release.yml` | 两阶段版本更新与 tag 事件适配（Task 9）；release.yml 增加 web 静态压缩包构建与发布；服务端与桌面产物改为「二进制 + 外部前端」打包，不再 embed |
| `scripts/AGENTS.md` | 版本脚本描述补 submodule 守卫（Task 9） |
| `app/server/internal/router/router.go` | `serveSPA` 为 `index.html` 响应补 `Cache-Control: no-store`（Task 9） |
| `Dockerfile` | 移除把前端产物 COPY 进 `internal/webui/dist` 的逻辑；final stage 增加 `/app/static` 并把前端产物 COPY 进去（Task 11） |
| `deploy/docker-compose.yml` / `deploy/docker-compose.standard.yml` | `STATIC_DIR=/app/static` 挂载点随发布包前端目录调整（Task 11） |
| `app/server/internal/webui/embed.go` / `stub.go` | 移除 `go:embed`，`webui` 包改为仅提供外部目录探测与 `HasAssets()` 兼容层（Task 11） |
| `app/desktop/mygo.config.ts` / `app/desktop/updater*.go` | 桌面宿主改为加载外部前端目录；updater 改查 GOSpeak-Desktop 仓库（Task 11/12） |
| `app/server/internal/service/system_update_service.go` + `_test.go` | 更新检测抽象为多仓库模型，新增 web 检测，desktop / mobile 各自查对应子仓库（Task 12） |
| `app/server/internal/handler/system_update_handler.go` + `app/server/internal/router/routes/system/routes.go` | 新增按组件查询更新端点（Task 12） |
| `app/web/src/api/system.ts` + `app/web/src/components/modal/settingModal/tab_item/about.tsx` | 前端新增 web 前端更新检测入口与展示（Task 12） |

**删除（从主仓库 index 移除，文件由 submodule checkout 重建）**

| 路径 | 说明 |
|---|---|
| `app/web/**` | 由 `git rm -r --cached app/web` 移除跟踪 |
| `app/desktop/**` | 由 `git rm -r --cached app/desktop` 移除跟踪 |
| `app/mobile/**` | 由 `git rm -r --cached app/mobile` 移除跟踪 |

---

## Task 1: 执行前状态快照与决策点确认

**Files:**
- Modify: `docs/superpowers/specs/2026-11-25-submodule-split-design.md`（回填决策点）
- Test: 无（本任务产出状态快照文件与确认结果）

**Interfaces:**
- Consumes: 当前工作区状态。
- Produces: 决策点结论（子仓库地址、未提交改动处理方式、子仓库结构）；供 Task 2/3/4 使用。

- [ ] **Step 1: 记录当前工作区状态**

Run:
```bash
cd /Users/noelorin/Projects/GOSpeak
git status --short > /tmp/gospeak-submodule-pre-status.txt
git diff --stat >> /tmp/gospeak-submodule-pre-status.txt
```
Expected: 输出到文件且包含 `app/web` 的修改条目。

- [ ] **Step 2: 确认决策点**

确认三项：
1. 子仓库地址是否采用默认值（见 Global Constraints）。
2. 未提交改动处理：采用「先提交到当前分支」还是「stash 后在子仓库 reapply」。推荐先提交。
3. 子仓库结构采用「根即原目录内容」。

把结论回填到 `docs/superpowers/specs/2026-11-25-submodule-split-design.md` 的「决策点」章节，把未采纳的候选删除或标注为未选。

- [ ] **Step 3: 按决策处理未提交改动并签出工作分支**

**方式 A（推荐，改动进入子仓库历史）**：把未提交改动先提交到 `origin/release` 的本地跟踪分支，再从该分支签出工作分支：
```bash
git fetch origin
git switch -C release-tmp origin/release
git add -A
git commit -m "chore: snapshot worktree before submodule split"
git push -u origin release-tmp:release   # 需授权推送到共享分支；若不允许则停下询问
git switch -c chore/submodule-split release-tmp
```
Expected: snapshot 提交位于 `release-tmp`，工作分支从它签出；后续 Task 3 抽取时会包含该提交。

**方式 B（改动不进子仓库历史）**：当前分支提交或 stash，再从 `origin/release` 签出：
```bash
git add -A
git commit -m "chore: snapshot worktree before submodule split"
git fetch origin
git switch -c chore/submodule-split origin/release
```
Expected: snapshot 提交留在原分支（如 `dev-1124`），子仓库从干净的 `origin/release` 抽取，**不含这些改动**；执行者须明确接受这一后果。

Ruling: 默认采用方式 A 以保证 `app/web` 改动进入子仓库历史；若你不授权推送到 `release`，退化为方式 B 并在设计文档标注。代价：方式 B 会丢失子仓库中的这些改动历史。

---

## Task 2: 创建三个远端空仓库

**Files:** 无本地文件（GitHub 远端操作）

**Interfaces:**
- Consumes: Task 1 确认的子仓库地址。
- Produces: 三个可推送的空仓库；供 Task 3 推送。

- [ ] **Step 1: 创建空仓库**

在 GitHub 上创建三个仓库（用 `gh` CLI 或网页），均不初始化 README/LICENSE/.gitignore：
```bash
gh repo create NoelOrin/GOSpeak-Web --private --confirm
gh repo create NoelOrin/GOSpeak-Desktop --private --confirm
gh repo create NoelOrin/GOSpeak-Mobile --private --confirm
```
Expected: `gh repo view NoelOrin/GOSpeak-Web` 等三个命令均成功。

- [ ] **Step 2: 验证远端可写**

```bash
git ls-remote https://github.com/NoelOrin/GOSpeak-Web.git
```
Expected: 命令成功（空仓库无输出或仅 HEAD）。

---

## Task 3: 抽取三个目录历史到子仓库

**Files:** 临时目录 `/tmp/gospeak-submodule-extract/{web,desktop,mobile}`（由 filter-repo 创建）

**Interfaces:**
- Consumes: Task 1 的工作分支基准；Task 2 的远端。
- Produces: 三个远端 `release` 分支，各自包含对应目录历史；供 Task 4 接入。

- [ ] **Step 1: 确认 git-filter-repo 可用**

```bash
git filter-repo --version || python3 -m pip install --user git-filter-repo
```
Expected: 输出版本号。若安装失败，改用 `git subtree split` 退化路径并在设计文档标注。

- [ ] **Step 2: 抽取 app/web**

```bash
rm -rf /tmp/gospeak-submodule-extract/web
git clone --no-local --branch chore/submodule-split /Users/noelorin/Projects/GOSpeak /tmp/gospeak-submodule-extract/web
cd /tmp/gospeak-submodule-extract/web
git filter-repo --path app/web --path-rename app/web/: --force
git checkout -b release
git remote add origin https://github.com/NoelOrin/GOSpeak-Web.git
git push -u origin release
```
Expected: 推送成功；子仓库根出现 `src/`、`package.json` 等原 `app/web` 内容。

- [ ] **Step 3: 验证 app/web 历史**

```bash
cd /tmp/gospeak-submodule-extract/web
git log --oneline -5
git ls-tree -d HEAD --name-only
```
Expected: log 中至少有 3 条真实历史提交（非唯一初始提交）；根目录含 `src` 目录。

- [ ] **Step 4: 抽取 app/desktop**

对 `app/desktop` 重复 Step 2/3，远端 `GOSpeak-Desktop.git`，临时目录 `/tmp/gospeak-submodule-extract/desktop`。

Expected: 子仓库根含原 `app/desktop` 的 `*.go`、`README.md` 等；历史非空。

- [ ] **Step 5: 抽取 app/mobile**

对 `app/mobile` 重复 Step 2/3，远端 `GOSpeak-Mobile.git`，临时目录 `/tmp/gospeak-submodule-extract/mobile`。

Expected: 子仓库根含 `package.json`、`capacitor.config.ts`、`ios/`、`android/`；历史非空。

- [ ] **Step 6: 清理临时 clone**

```bash
rm -rf /tmp/gospeak-submodule-extract
```
Expected: 目录不存在。

---

## Task 4: 处理主仓库工作区并移除目录跟踪

**Files:**
- Modify: `app/web/**`, `app/desktop/**`, `app/mobile/**`（从 index 移除）

**Interfaces:**
- Consumes: Task 1 的干净工作区与分支；Task 3 的子仓库已就绪。
- Produces: 主仓库 index 中三个路径无普通文件；供 Task 5 添加 submodule。

- [ ] **Step 1: 再次核对工作区干净**

```bash
cd /Users/noelorin/Projects/GOSpeak
git status --short
```
Expected: 输出为空或仅含计划/设计文档修改。

- [ ] **Step 2: 从 index 移除三个目录（保留本地文件用于比对）**

```bash
git rm -r --cached app/web app/desktop app/mobile
```
Expected: 命令成功；`git status --short` 显示大量 `D  app/web/...` 等删除条目。

- [ ] **Step 3: 删除本地目录内容**

```bash
rm -rf app/web app/desktop app/mobile
```
Expected: 三个目录不存在。

- [ ] **Step 4: 验证 index 无普通文件残留**

```bash
git ls-files app/web app/desktop app/mobile | head -20
```
Expected: 输出为空。

---

## Task 5: 添加三个 submodule 并锁定指针

**Files:**
- Create: `.gitmodules`
- Modify: gitlink `app/web`, `app/desktop`, `app/mobile`（mode 160000）

**Interfaces:**
- Consumes: Task 3 的子仓库；Task 4 的空路径。
- Produces: `.gitmodules` 与三个 gitlink；供 Task 6 提交。

- [ ] **Step 1: 添加 app/web submodule**

```bash
cd /Users/noelorin/Projects/GOSpeak
git submodule add -b release https://github.com/NoelOrin/GOSpeak-Web.git app/web
```
Expected: 命令成功；`app/web` 目录重新出现且含 `src/`、`package.json`。

- [ ] **Step 2: 添加 app/desktop submodule**

```bash
git submodule add -b release https://github.com/NoelOrin/GOSpeak-Desktop.git app/desktop
```
Expected: 同上。

- [ ] **Step 3: 添加 app/mobile submodule**

```bash
git submodule add -b release https://github.com/NoelOrin/GOSpeak-Mobile.git app/mobile
```
Expected: 同上。

- [ ] **Step 4: 验证 .gitmodules 路径精确**

```bash
git config -f .gitmodules --get-regexp 'submodule\..*\.path'
git config -f .gitmodules --get-regexp 'submodule\..*\.url'
```
Expected: 三条 path 精确为 `app/web`、`app/desktop`、`app/mobile`；url 与 Task 2 一致。

- [ ] **Step 5: 验证 gitlink 模式**

```bash
git ls-files -s app/web app/desktop app/mobile
```
Expected: 三行 mode 均为 `160000`，即 gitlink。

- [ ] **Step 6: 提交 submodule 接入**

```bash
git add .gitmodules app/web app/desktop app/mobile
git commit -m "refactor: split web desktop mobile into git submodules"
```
Expected: 提交成功；`git status --short` 干净。

---

## Task 6: 文档与索引更新

**Files:**
- Modify: `docs/superpowers/plans/README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 5 已提交的 submodule 结构。
- Produces: 文档反映三端为 submodule；供 Task 7 验证。

- [ ] **Step 1: 更新 plans/README.md**

在「进行中 / 待跟进」表格中新增一行：
```
| [三端拆分为 Git Submodule](./2026-11-25-submodule-split.md) | 进行中 | 待验证 submodule 全量门禁 |
```
Expected: 表格新增该行。

- [ ] **Step 2: 更新 AGENTS.md**

在「目录骨架」代码块中把 `app/web` / `app/desktop` / `app/mobile` 注释加上「（git submodule）」；在「单一事实源索引」表新增一行，指向 `.gitmodules` 作为子仓库地址事实源。

Expected: `grep -n "submodule" AGENTS.md` 至少两处命中。

- [ ] **Step 3: 提交文档**

```bash
git add docs/superpowers/plans/README.md AGENTS.md
git commit -m "docs: update submodule layout and plan index"
```
Expected: 提交成功。

---

---

## Task 7: CI 按仓库归属拆分（各端 CI 迁回各自子仓库）

**Files:**
- Modify: `.github/workflows/ci.yml`（checkout submodules + 路径过滤器 + protocol-check；移除三端专属 job）
- Modify: `.github/workflows/release.yml`（移除 build-web / build-desktop* / desktop-checksums；仅保留 server 与协调）
- Delete: `.github/workflows/build-mobile.yml`（迁移到 GOSpeak-Mobile）
- Modify: `.github/workflows/docker.yml`、`.github/workflows/docs.yml`、`.github/workflows/security.yml`、`.github/workflows/version-bump.yml`（checkout 加 submodules；移除三端相关步骤）
- Create: `docs/superpowers/specs/2026-11-25-submodule-ci-design.md`（CI 归属矩阵与触发规则）
- 在三个子仓库中 Create: `.github/workflows/ci.yml`（各自独立 CI）与 `.github/workflows/release.yml`（各自独立发布；由 Task 3 的子仓库提交落地）

**Interfaces:**
- Consumes: Task 5 的 submodule 结构；现有 workflows 内容。
- Produces: 每端 CI 在各自仓库运行；主仓库 CI 只负责 server 与跨仓协调；供 Task 8 验证。

**CI 归属矩阵（写入设计文档）：**

| 工作流 | 所属仓库 | 职责 |
|---|---|---|
| CI（server / Go / scripts / protocol / 集成测试） | GOSpeak 主仓库 | 只跑 `app/server`、`internal/*`、`scripts`、`test`、`packages/*`（workspace 包仍留主仓库） |
| CI（lint / typecheck / test / build web） | GOSpeak-Web | 前端自身质量门禁；生成物 `dist/` 由本仓 release 打包 |
| CI（Go / mygo build / 安装包） | GOSpeak-Desktop | 桌面宿主自身门禁与安装包构建 |
| CI（Capacitor sync / gradle / xcode） | GOSpeak-Mobile | 移动壳自身门禁与 APK/IPA 构建 |
| Release（server / web 压缩包 / Docker） | GOSpeak 主仓库 | 按需 `workflow_call` 子仓库 release 产出，或消费其 Release 附件 |
| Release（desktop） | GOSpeak-Desktop | 安装包与签名更新元数据的**构建**，产物供主仓库 Release 消费；不打独立 tag |
| Release（mobile） | GOSpeak-Mobile | APK / IPA 的**构建**，产物供主仓库 Release 消费；不打独立 tag |

- [ ] **Step 1: 改造 ci.yml 的 checkout**

把所有 `uses: actions/checkout@v7` 改为：
```yaml
- uses: actions/checkout@v7
  with:
    submodules: recursive
    fetch-depth: 0
```
注意 `test-scripts` job 已有 `fetch-depth: 0`，只加 `submodules: recursive` 即可。

Expected: `grep -c "checkout@v7" .github/workflows/ci.yml` 与 `grep -c "submodules: recursive"` 数量一致。

- [ ] **Step 2: 改造 paths-filter 过滤器**

在 `js` 与 `go` 过滤器中加入 gitlink 路径本身（因为主仓库 PR 只改 gitlink，`app/web/**` 不会显示变更）：
```yaml
go:
  - 'app/server/**'
  - 'app/server/go.mod'
  - 'app/server/go.sum'
  - 'app/desktop'           # gitlink
  - 'app/shared/**'
js:
  - 'app/web'               # gitlink
  - 'app/mobile'            # gitlink
  - 'app/desktop/mygo.config.ts'   # 删除：该文件已在子仓库，主仓库不再有
  - 'app/desktop/package.json'     # 删除：同上
  - 'packages/**'
  - 'test/**'
  ...
```
注意 `app/desktop/**/*.go` 等具体文件模式在主仓库已失效，统一替换为 `app/desktop` gitlink。

Expected: 过滤器包含三项 gitlink 路径，不含 `app/web/**` / `app/desktop/**` / `app/mobile/**` 文件模式。

- [ ] **Step 3: 改造 protocol-check job**

原命令 `git diff --exit-code -- ../web/src/protocol/generated` 在主仓库看不到子仓库内变化。改为校验子仓库 gitlink 未变化，**必须去掉 `working-directory: app/server`，从 repo root 运行**：
```bash
git diff --exit-code -- app/web
```
若保留 `working-directory: app/server`，路径应写为 `../app/web`。

Expected: 命令在主仓库运行退出码 0；若子仓库内生成物变化但 gitlink 未更新，此检查不会报错——记录为已知限制，由子仓库自身 CI 覆盖。

- [ ] **Step 4: 改造其余 workflows checkout**

对 `release.yml`、`build-mobile.yml`、`docker.yml`、`docs.yml`、`security.yml`、`version-bump.yml` 中所有 `actions/checkout@v7` 加 `with: submodules: recursive`（已有 `with` 的合并进去）。

Expected: `grep -r "checkout@v7" .github/workflows/` 的每项都有 `submodules: recursive`。

- [ ] **Step 5: 从主仓库 CI 移除三端专属 job**

从 `ci.yml` 删除 `build-js`（`@gospeak/web` 构建）、`test-web`、`desktop-go` 中前端/桌面构建相关步骤；`lint` 的路径参数去掉 `./app/web` / `./app/desktop` / `./app/mobile`；`typecheck` 只保留主仓库 workspace 包。从 `release.yml` 删除 `build-web`、`build-desktop-macos`、`build-desktop-others`、`desktop-checksums` 及所有向 `webui/dist` 拷贝前端产物的步骤；删除 `build-mobile.yml`。这些 job 全部迁到各自子仓库。

Expected: `grep -r "app/web\|app/desktop\|app/mobile" .github/workflows/` 仅剩 gitlink 路径与 checkout 配置，不含具体源码构建步骤。

- [ ] **Step 6: 在三个子仓库建立独立 CI / Release**

在 GOSpeak-Web 创建 `.github/workflows/ci.yml`（lint / typecheck / vitest / build 前端产物）与 `release.yml`（前端静态压缩包构建，产物以 workflow artifact / `workflow_call` 输出形式供主仓库消费）。在 GOSpeak-Desktop 创建 `.github/workflows/ci.yml`（go vet + go test + mygo build）与 `release.yml`（安装包构建，产物同样供主仓库消费）。在 GOSpeak-Mobile 创建 `.github/workflows/ci.yml`（capacitor sync + gradle/xcode 构建）与 `release.yml`（APK/IPA 构建）。**子仓库 Release 不自己打发布 tag、不自己创建 GitHub Release**；发布 tag 统一在主仓库（四组件 `gospeak-<component>-v<semver>`），子仓库 workflow 由主仓库 `workflow_call` 或 gitlink 版本事件触发。这些 workflow 随 Task 3 的子仓库初始化提交落地，不放在主仓库。

Expected: 三个子仓库各自的 `.github/workflows/` 有 ci.yml 与 release.yml；主仓库无 `build-mobile.yml`。

- [ ] **Step 7: 建立 CI 归属设计文档**

创建 `docs/superpowers/specs/2026-11-25-submodule-ci-design.md`，写入上文「CI 归属矩阵」、触发规则（子仓库 push/tag 触发自身 CI/Release；主仓库靠 gitlink 更新触发自身 CI）、主仓库不再承担三端构建、子仓库 release 产物由主仓库按需消费的规则。

Expected: 文档存在且包含归属矩阵四条核心行。

- [ ] **Step 8: 提交 CI 改造**

```bash
git add .github/workflows/ docs/superpowers/specs/2026-11-25-submodule-ci-design.md
git commit -m "ci: move per-platform workflows into submodule repos"
```
Expected: 提交成功。

- [ ] **Step 9: 验证 workflow 语法**

```bash
curl -sSfL https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz | tar xz -C /tmp actionlint
/tmp/actionlint -color .github/workflows/
```
Expected: 无错误输出。

---

## Task 8: 全量验证与全新 clone 复现

**Files:** 无文件改动（验证任务）

**Interfaces:**
- Consumes: Task 5/6 的提交。
- Produces: 验证结论；若失败回到对应任务修复。

- [ ] **Step 1: 校验 submodule 状态**

```bash
cd /Users/noelorin/Projects/GOSpeak
git submodule status
```
Expected: 三行均以空格开头（无 `+` 或 `-` 前缀），表示 checkout 与 gitlink 一致。

- [ ] **Step 2: 前端门禁**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Expected: 全部退出码 0。

- [ ] **Step 3: 三目标构建**

```bash
pnpm --filter @gospeak/web build
pnpm --filter @gospeak/web build:desktop
pnpm --filter @gospeak/web build:mobile
```
Expected: 三个目标均构建成功。

- [ ] **Step 4: Go 门禁与服务端测试**

```bash
go vet ./app/server/... ./app/desktop/...
pnpm test:server:go
```
Expected: 全部成功。

- [ ] **Step 5: 全新 clone 复现**

```bash
rm -rf /tmp/gospeak-submodule-verify
git clone https://github.com/NoelOrin/GOSpeak.git /tmp/gospeak-submodule-verify
cd /tmp/gospeak-submodule-verify
git submodule update --init --recursive
ls app/web/src app/desktop app/mobile/android
```
Expected: 目录内容完整；`git submodule status` 三行无前缀异常。

- [ ] **Step 6: 清理验证 clone**

```bash
rm -rf /tmp/gospeak-submodule-verify
```
Expected: 目录不存在。

- [ ] **Step 7: 更新计划状态**

在本计划顶部加 Status 块，记录验证结果与日期。

Expected: 计划状态块存在。

---

---

## Task 9: 通过 metadata.yaml 做版本与元数据管理（独立发布）

**Files:**
- Create: `metadata.yaml`（主仓库总控）
- Create: `metadata.yaml`（三个子仓库各自一份，通过 Task 3 的子仓库提交落地）
- Modify: `scripts/check-version.mjs` + `scripts/check-version.test.mjs`（改读 metadata.yaml + submodule 守卫）
- Modify: `scripts/release-naming.mjs` + `scripts/release-naming.test.mjs`（mobile 与 web 组件）
- Modify: `scripts/build-changelog.mjs` / `release-notes.mjs` + 各自 test（按组件生成）
- Modify: `.github/workflows/version-bump.yml` / `release.yml`（metadata 驱动、按组件 bump；release.yml 增加 web 静态压缩包构建与发布）
- Delete: `.github/versions/{server,desktop,mobile}.yaml`（迁移到 metadata.yaml）
- Create: `docs/superpowers/specs/2026-11-25-submodule-release-design.md`（含 web 外部更新规则）
- Modify: `app/server/internal/router/router.go`（`serveSPA` 补 `index.html` no-store 响应头）
- Modify: `scripts/AGENTS.md`、根 `AGENTS.md`

**Interfaces:**
- Consumes: Task 5 的 submodule 结构；Task 7 改造后的 CI workflows。
- Produces: 以 metadata.yaml 为核心的版本与元数据管理；独立发布规则得到落地。

**元数据模型（builder call，已记录）：**

采用方案 C：主仓库总控 + 子仓库各自一份，分层聚合。

`metadata.yaml`（主仓库根）结构：
```yaml
schema_version: 1
components:
  server:
    version: 1.2.0
    source: app/server
    tag: gospeak-server-v1.2.0
    release: true
  web:
    version: 1.0.0
    source: app/web            # git submodule
    metadata_ref: app/web/metadata.yaml
    tag: gospeak-web-v1.0.0
    release: true              # 产物为 dist/ 静态压缩包，供外部 STATIC_DIR 部署
  desktop:
    version: 1.1.0
    source: app/desktop        # git submodule
    metadata_ref: app/desktop/metadata.yaml
    tag: gospeak-desktop-v1.1.0
    release: true
  mobile:
    version: 0.9.0
    source: app/mobile         # git submodule
    metadata_ref: app/mobile/metadata.yaml
    tag: gospeak-mobile-v0.9.0
    release: true              # 产物由 build-mobile.yml 发布
```

`metadata.yaml`（子仓库根，以 desktop 为例）：
```yaml
schema_version: 1
component: desktop
version: 1.1.0
metadata:
  name: GOSpeak Desktop
  description: GOSpeak 桌面客户端
  platforms: [darwin/amd64, darwin/arm64, windows/amd64, linux/amd64, linux/arm64]
  artifact_type: installer
  changelog: CHANGELOG.md
```

`metadata.yaml`（web 子仓库根）：
```yaml
schema_version: 1
component: web
version: 1.0.0
metadata:
  name: GOSpeak Web
  description: GOSpeak 前端静态产物
  platforms: [any]
  artifact_type: static-archive
  changelog: CHANGELOG.md
```

规则：
- 主仓库总控的 `components.<name>.version` 是最终事实源；子仓库 `version` 必须与之一致，由 CI 校验。
- `metadata_ref` 指向子仓库 metadata 文件，check-version 会读取并比对版本。
- 元数据字段（name/description/platforms/artifact_type/changelog）供 release-notes 与 build-changelog 消费。
- **版本号不统一发布**：server / web / desktop / mobile 四组件各自独立 SemVer，互不跟随。
- 版本 bump 只针对发生变更的组件：先改该子仓库 `metadata.yaml` 与版本文件并 commit/push，再更新主仓库总控 `metadata.yaml` 的 `version` 与 `tag`，最后更新 gitlink 并打 tag。
- 每个组件独立 tag / 独立 Release / 独立 changelog；不再「一版一个 Release、两端共用 server 版本号」。
- 子仓库 commit message 约定：`chore(<component>): bump version to <semver>`，gitlink bump 与版本发布解耦。

- [ ] **Step 1: 写 release-naming 增加 mobile 与 web 组件的测试**

在 `scripts/release-naming.test.mjs` 加：
```js
test("releaseTag mobile", () => {
  assert.equal(releaseTag("mobile", "1.2.0"), "gospeak-mobile-v1.2.0");
  assert.deepEqual(parseReleaseTag("gospeak-mobile-v1.2.0"), { component: "mobile", version: "1.2.0" });
});
test("releaseTag web", () => {
  assert.equal(releaseTag("web", "1.0.0"), "gospeak-web-v1.0.0");
  assert.deepEqual(parseReleaseTag("gospeak-web-v1.0.0"), { component: "web", version: "1.0.0" });
});
```
Run: `node --test scripts/release-naming.test.mjs`
Expected: FAIL（mobile 与 web 不在 COMPONENTS 中）。

- [ ] **Step 2: 实现 mobile 与 web 组件**

把 `scripts/release-naming.mjs` 的 `COMPONENTS` 改为 `["server", "web", "desktop", "mobile"]`。

Run: `node --test scripts/release-naming.test.mjs`
Expected: PASS。

- [ ] **Step 3: 写 metadata 读取与一致性校验测试**

新建 `scripts/metadata.test.mjs`，实现 `readMetadata(rootDir, component)` 的测试：
- 主仓库总控存在 `components.<component>.version`。
- 子仓库 `metadata.yaml` 的 `version` 与总控一致；不一致时返回 issue。
- 子仓库未 checkout 时返回「submodule not initialized」明确错误。

Run: `node --test scripts/metadata.test.mjs`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 metadata 读取模块**

新建 `scripts/metadata.mjs`：零依赖解析 `metadata.yaml`（用正则，风格对齐现有 check-version.mjs 的 `readDeclaredVersion`），导出 `readMetadata(rootDir, component)` 与 `checkMetadataConsistency(rootDir, component)`。

Run: `node --test scripts/metadata.test.mjs`
Expected: PASS。

- [ ] **Step 5: 改造 check-version.mjs 读 metadata.yaml**

把 `.github/versions/*.yaml` 的读取改为 `scripts/metadata.mjs`，删除旧 yaml 文件。保留原有「VERSION / package.json / mygo.config.ts / build.gradle / pbxproj」一致性校验，但声明源改为 metadata。

Run: `node --test scripts/check-version.test.mjs`
Expected: PASS（测试 fixture 改为 metadata.yaml）。

**metadata ↔ tag 协同规则（新增）：**
- **tag 由 metadata 派生，不手写**：`gospeak-<component>-v<metadata.components.<component>.version>`，一律经 `release-naming.mjs tag` 生成。
- **tag 存在性驱动发布**：version-bump 对每个组件检测远端 tag 是否存在；不存在则打 annotated tag 并 `workflow_call` 调 release.yml；已存在则跳过（幂等）。
- **metadata ↔ tag 双向一致性**：
  - 正向：`check-version.mjs` 校验 `metadata.version` 与 tag 解析出的 version 一致（tag 事件时）。
  - 反向：`metadata.yaml` 中显式写 `tag` 字段，CI 校验它等于 `release-naming.mjs tag <component> <version>` 的派生结果，防止手工写错。
- **子仓库 metadata 协同**：子仓库 `metadata.yaml` 的 `version` 必须与主仓库总控一致；不一致时 version-bump 拒绝打 tag（CI 门禁）。
- **删除 lockstep 约束**：现有 `version-bump.yml` 第 78–89 行 `Require lockstep component versions` 强制 server/desktop 同版本，与独立发布冲突，必须删除；改为每组件独立判断 tag 存在性。
- **tag 指向的 commit**：annotated tag 打在主仓库「更新 metadata + gitlink 的那次提交」上，保证 tag 对应的 tree 中 submodule 指针就是该组件版本的文件状态。
- **发布 tag 归属（修正）**：发布 tag 只在主仓库（四组件统一 `gospeak-<component>-v<semver>`）；子仓库不打发布 tag，避免双源冲突。子仓库自身 CI/Release 由主仓库通过 `workflow_call` 或 GitHub Release 事件触发，消费主仓库 tag 对应的 gitlink 版本，而不是自己打 tag 触发。子仓库可用轻量 tag 做内部标记，但 CI 不得以其触发发布。

- [ ] **Step 6: 写 metadata ↔ tag 协同测试**

在 `scripts/metadata.test.mjs` 增加：
- `checkTagConsistency(metadata, component)`：metadata 中 `tag` 字段必须等于 `release-naming.mjs tag` 的派生结果；不等时返回 issue。
- 子仓库 `metadata.version` 与主仓库总控不一致时返回 issue。

Run: `node --test scripts/metadata.test.mjs`
Expected: FAIL（函数未实现）。

- [ ] **Step 7: 实现 tag 协同校验**

在 `scripts/metadata.mjs` 实现 `checkTagConsistency` 与子仓库版本一致性检查，从 `release-naming.mjs` 导入 `releaseTag`。

Run: `node --test scripts/metadata.test.mjs`
Expected: PASS。

- [ ] **Step 8: 改造 version-bump.yml 为 metadata 驱动的按组件 bump + tag 协同**

流程：
```
checkout（with submodules + fetch-depth: 0）
→ 读取主仓库 metadata.yaml，逐组件取 version/tag
→ 对每个组件：校验 metadata.tag === release-naming 派生 tag；
   校验子仓库 metadata.version === 总控 version（不一致则 fail，不打 tag）
→ 检测远端 tag 是否已存在（git ls-remote --tags origin）
→ 仅对「版本变化且 tag 不存在」的组件：
   打 annotated tag gospeak-<component>-v<version> 到当前 HEAD
   （HEAD 必须是更新 metadata + gitlink 的那次提交）
   → 推送 tag → workflow_call 调 release.yml 仅发布该组件
→ 其他组件 tag 已存在则跳过（幂等）
```
关键：**删除原第 78–89 行 lockstep 同版本约束**；**不 bump 其他组件**；tag 与 metadata 双向一致才允许打 tag。

Expected: actionlint 通过；dry-run 验证：
- 两组件版本不同时不再报错;
- metadata.tag 写错时 CI 失败;
- 子仓库版本不一致时 CI 失败;
- tag 已存在时幂等跳过。

- [ ] **Step 9: 改造 release.yml 为一组件一 Release**

去掉「统一 Release」逻辑，按 component 条件构建与发布；Release 正文由 `metadata.yaml` 的 `metadata` 字段驱动（name/description/platforms/artifact_type/changelog）。mobile 产物由独立 `build-mobile.yml` 发布，不在本 workflow 构建。

Expected: `/tmp/actionlint -color .github/workflows/` 无错误。

- [ ] **Step 10: 改造 build-changelog.mjs 与 release-notes.mjs**

按组件从 metadata 读取 changelog 路径与元数据，从子仓库 git log（或 gitlink bump commit）提取该组件变更；Release 正文只含该组件下载表格与说明。

Run: `node --test scripts/build-changelog.test.mjs scripts/release-notes.test.mjs`
Expected: 旧「一版含两端」断言改为按组件断言后 PASS。

- [ ] **Step 11: 落地子仓库 metadata.yaml**

在 Task 3 抽取后、Task 5 接入前，把子仓库 `metadata.yaml` 作为子仓库首提交的一部分（或单独提交）推送。三个子仓库各自文件见上方结构。

Expected: 每个子仓库根目录有 `metadata.yaml` 且 `component` 字段正确。

- [ ] **Step 12: 编写版本与元数据设计文档**

创建 `docs/superpowers/specs/2026-11-25-submodule-release-design.md`，覆盖：方案 C 分层模型、metadata 字段结构、独立发布规则、metadata ↔ tag 双向一致性、tag 存在性驱动发布（幂等）、删除 lockstep 约束、两阶段按组件 bump、子仓库 commit 约定、mobile 独立构建原因、gitlink 与版本解耦。

Expected: 文档存在且包含上述七点。

- [ ] **Step 13: 更新 AGENTS.md 文档**

`scripts/AGENTS.md`：新增 `metadata.mjs` 行；`check-version.mjs` 描述改为读 metadata；`release-naming.mjs` 改四组件（含 web）；新增设计文档指针。根 `AGENTS.md` §6 补「版本与元数据以 metadata.yaml 为单一事实源，四组件独立发布」。设计文档 `2026-11-25-submodule-release-design.md` 必须包含 web 静态包发布与外部 `STATIC_DIR` 更新规则、embed 兜底关系。

Expected: `grep -n "metadata.yaml" scripts/AGENTS.md AGENTS.md` 有命中；`grep -n "STATIC_DIR" docs/superpowers/specs/2026-11-25-submodule-release-design.md` 有命中。

- [ ] **Step 14: release.yml 增加 web 静态压缩包构建与发布**

在 `release.yml` 的按组件构建阶段增加 web 分支：当 tag component 为 `web` 时，checkout 主仓库并 `git submodule update --init app/web`，执行 `pnpm install --frozen-lockfile` 与 `pnpm --filter @gospeak/web build`，把 `app/web/dist/` 打包为 `gospeak-web-v<version>.tar.gz`（保留目录结构，含 `index.html` 与带 hash 的 assets），作为该组件 Release 的下载产物。产物命名走 `release-naming.mjs` 派生，不手写版本号。

Expected: 手动触发 web tag 事件后 Release 附件出现 `gospeak-web-v<version>.tar.gz`；actionlint 通过。

- [ ] **Step 15: serveSPA 补 index.html no-store 响应头**

在 `app/server/internal/router/router.go` 的 `serveSPA` 中，定位 `serveIndex` 的两个实现（外部目录分支与 embed 分支），在返回 `index.html` 前设置 `c.Header("Cache-Control", "no-store")`。只针对首页，带 hash 的静态资源仍可长缓存。

Run: `go test ./internal/router/...`（在 `app/server` 下）
Expected: 测试通过；`grep -n "no-store" app/server/internal/router/router.go` 至少两处命中。

- [ ] **Step 16: 全量脚本测试**

```bash
node --test scripts/*.test.mjs
```
Expected: 全部通过。

- [ ] **Step 17: 提交**

```bash
git add metadata.yaml scripts/ .github/workflows/version-bump.yml .github/workflows/release.yml docs/superpowers/specs/2026-11-25-submodule-release-design.md scripts/AGENTS.md AGENTS.md app/server/internal/router/router.go
git commit -m "feat: metadata-driven versioning with independent releases"
```
Expected: 提交成功。

## Task 10: 前端去 embed，与二进制一起分发

**Files:**
- Modify: `app/server/internal/webui/embed.go` / `stub.go`（移除 go:embed，保留外部目录探测兼容层）
- Modify: `app/server/internal/router/router.go`（仅保留外部目录路径，移除 webui.FS() 兜底分支）
- Modify: `Dockerfile`（final stage 增设 `/app/static` 并 COPY 前端产物）
- Modify: `deploy/docker-compose.yml` / `deploy/docker-compose.standard.yml`（前端目录挂载点）
- Modify: `.github/workflows/ci.yml` / `release.yml`（去掉往 `internal/webui/dist` 与 `app/desktop/webui/dist` 的拷贝，改为随发布包输出 `static/`）
- Modify: `app/desktop/mygo.config.ts` / `app/desktop/*.go`（桌面宿主读外部前端目录）
- Modify: `app/server/internal/webui/AGENTS.md` / 根 `AGENTS.md` / `app/web/AGENTS.md`（文档同步）

**Interfaces:**
- Consumes: Task 9 的 web 静态压缩包产物；Task 5 的 submodule 结构。
- Produces: 服务端与桌面产物均为「二进制 + 外部前端目录」；无 embed 前端。

- [ ] **Step 1: 写移除 embed 的测试**

为 `webui` 包新增测试：`HasAssets()` 在外部 `static` 目录不存在时为 false；`FS()` 恒返回 nil（或删除该 API 后测试路由仅走外部目录）。为 `serveSPA` 补测试：无外部目录时返回 404/空响应而非 embed 内容。

Run: `go test ./internal/webui/... ./internal/router/...`（在 `app/server` 下）
Expected: FAIL（embed 逻辑仍在）。

- [ ] **Step 2: 移除 go:embed 与兜底分支**

删除 `embed.go` 的 `//go:embed all:dist` 与 `embedded` 变量，`webui` 包只保留 `HasAssets()`（探测外部目录）与必要的路径常量；`stub.go` 相应简化。删除 `router.go` 中 `webui.FS()` 回退分支，仅保留 `STATIC_DIR > /app/static > ./static` 三级外部目录。

Run: `go test ./internal/webui/... ./internal/router/...`
Expected: PASS。

- [ ] **Step 3: 改造 Dockerfile 与 compose**

`Dockerfile` 删除 `COPY --from=web-builder /src/app/web/dist/ ./internal/webui/dist/`；final stage 加 `COPY --from=web-builder /src/app/web/dist/ /app/static/`，`VOLUME` 增加 `/app/static`（或由 compose 挂载覆盖）。`deploy/docker-compose*.yml` 确认 `STATIC_DIR=/app/static` 并把前端产物挂载到该路径。

Run: `docker build -t gospeak-test .`（本地）
Expected: 镜像内 `/app/static/index.html` 存在，二进制不含前端资源。

- [ ] **Step 4: 改造 CI / release 产物布局**

删除 `.github/workflows/ci.yml` 与 `release.yml` 中所有向 `app/server/internal/webui/dist` 与 `app/desktop/webui/dist` 拷贝前端产物的步骤；服务端 release 产物改为 `gospeak-server-v<version>.tar.gz`（含二进制 + `static/` 目录），web 产物仍是纯 `static/` 压缩包。桌面端改为安装包内含外部前端目录，不再 `go:embed`。

Expected: actionlint 通过；release 产物列表含 server 与 web 两个可独立下载的压缩包。

- [ ] **Step 5: 桌面宿主改为外部前端目录**

`app/desktop/mygo.config.ts` 去掉 `webui/dist` 拷贝与 embed 相关注释，`buildCommand` 输出前端到安装包 `static/` 目录；`app/desktop` 中读取前端的 Go 代码改为指向该目录，缺失时给出明确错误提示（不再静默空页面）。

Run: `pnpm --filter @gospeak/desktop-app build`（或对应构建命令）
Expected: 桌面产物包含外部 `static/index.html`；启动能加载页面。

- [ ] **Step 6: 文档同步与提交**

更新 `app/server/internal/webui/AGENTS.md`（描述改为外部目录探测）、根 `AGENTS.md`（内嵌前端描述改为外部前端目录）、`app/web/AGENTS.md`（产物说明去掉 embed）、`deploy/DEPLOY.md`（补充前端独立更新与目录布局）。

```bash
git add app/server/internal/webui app/server/internal/router Dockerfile deploy .github/workflows app/desktop docs
 git commit -m "refactor: ship frontend outside binary and enable static dir updates"
```
Expected: 提交成功；`grep -r "go:embed" app/server app/desktop` 无命中。

## Task 11: 更新检测链路改为多仓库模型并新增 web 检测

**Files:**
- Modify: `app/server/internal/service/system_update_service.go` + `_test.go`
- Modify: `app/server/internal/handler/system_update_handler.go`
- Modify: `app/server/internal/router/routes/system/routes.go`
- Modify: `app/web/src/api/system.ts` + `app/web/src/api/system.test.ts` + `app/web/src/api/backgroundRequests.test.ts`
- Modify: `app/web/src/components/modal/settingModal/tab_item/about.tsx`
- Modify: `app/desktop/updater_release.go` + `app/desktop/updater.go` + `app/desktop/updater_release_test.go`
- Create: `docs/superpowers/specs/2026-11-25-update-check-design.md`

**Interfaces:**
- Consumes: Task 9 的四组件 metadata 与 tag 命名；Task 11 的去 embed 产物布局。
- Produces: server / web / desktop / mobile 各自从对应仓库检查最新 Release；前端提供 web 更新检测入口。

**仓库与 tag 映射（单一事实源，写入设计文档）：**

| 组件 | 仓库 | Release tag 前缀 | 当前版本来源 |
|---|---|---|---|
| server | `NoelOrin/GOSpeak` | `v`（如 `v1.2.3`） | `buildinfo.Version` |
| web | `NoelOrin/GOSpeak-Web` | `gospeak-web-v`（如 `gospeak-web-v1.0.0`） | 前端构建期常量或服务端下发 |
| desktop | `NoelOrin/GOSpeak-Desktop` | `gospeak-desktop-v` | 桌面宿主版本 |
| mobile | `NoelOrin/GOSpeak-Mobile` | `gospeak-mobile-v` | 移动壳版本 |

- [ ] **Step 1: 写多组件更新检测测试**

重写 `system_update_service_test.go`：为四个组件分别提供 stub GitHub API 响应，验证各自 tag 前缀过滤正确、互不影响；新增 web 组件检测用例；验证 desktop 旧逻辑（从主仓库读 `desktop-v*`）不再使用。

Run: `go test ./internal/service/... -run TestSystemUpdate`
Expected: FAIL（服务仍只支持单仓库）。

- [ ] **Step 2: 实现多仓库检测服务**

把 `SystemUpdateService` 改造为组件感知：配置表含仓库 API URL 与 tag 前缀；`Check(ctx, component)` 返回该组件的 `UpdateInfo`（Current/Latest/Available/Notes/URL）；每个组件独立缓存与负缓存，避免互相污染。web 的当前版本由服务端下发的 `web_version`（从 metadata 或独立版本文件读取）提供。

Run: `go test ./internal/service/... -run TestSystemUpdate`
Expected: PASS。

- [ ] **Step 3: 扩展 handler 与路由**

`CheckUpdate` 接受 `?component=server|web|desktop|mobile`（默认 server）；`CurrentVersion` 同样按组件返回。`routes.go` 保持两个端点不变，仅通过 query 参数区分组件。保留 admin 防御性校验。

Run: `go test ./internal/handler/... ./internal/router/...`
Expected: PASS。

- [ ] **Step 4: 桌面 updater 改查独立仓库**

`app/desktop/updater_release.go` 的 `githubAPILatest` 改为 `https://api.github.com/repos/NoelOrin/GOSpeak-Desktop/releases/latest`，tag 过滤改 `gospeak-desktop-v*`，资产名前缀同步；`releasePageURL` 改为 GOSpeak-Desktop releases 页面。更新测试 fixture。

Run: `go test ./app/desktop/...`（或对应包路径）
Expected: PASS；`grep -r "NoelOrin/GOSpeak/releases" app/desktop` 无命中（除注释）。

- [ ] **Step 5: 前端新增 web 更新检测入口**

`app/web/src/api/system.ts` 增加 `checkSystemUpdate(component)` 与 `getCurrentVersion(component)`；`about.tsx` 在非桌面环境下展示「前端版本」与「检查前端更新」按钮，调用 `component=web`；桌面环境下更新检查走宿主 updater（已改为查 GOSpeak-Desktop）。更新相关测试。

Run: `pnpm --filter @gospeak/web test`
Expected: PASS；`pnpm --filter @gospeak/web typecheck` PASS。

- [ ] **Step 6: 编写设计文档与提交**

创建 `docs/superpowers/specs/2026-11-25-update-check-design.md`，覆盖仓库/tag 映射表、四组件独立缓存、web 检测入口、桌面 updater 迁移、降级策略（仓库不可达时展示 releases 页面链接）。

```bash
git add app/server/internal/service app/server/internal/handler app/server/internal/router app/web/src/api app/web/src/components/modal/settingModal/tab_item app/desktop docs/superpowers/specs/2026-11-25-update-check-design.md
 git commit -m "feat: multi-repo update checks with web frontend detection"
```
Expected: 提交成功。

## Task 12: 发布链路优化（统一入口与产物绑定）

**Files:**
- Modify: `.github/workflows/release.yml`（resolve-tag 解析四组件；统一 Release 入口；按组件消费子仓库产物）
- Modify: `.github/workflows/version-bump.yml`（发布顺序 / 依赖编排）
- Modify: `scripts/release-naming.mjs` + test（保留四组件解析；禁止子仓库 tag 参与）
- Modify: `scripts/check-version.mjs` + test（tag 事件校验发布 tag 只来自主仓库）
- Create: `docs/superpowers/specs/2026-11-25-release-pipeline-design.md`

**Interfaces:**
- Consumes: Task 7（CI 归属）、Task 9（metadata + tag 规则）、Task 11（去 embed 产物布局）、Task 12（更新检测 tag 映射）。
- Produces: 统一的发布入口与可追溯的产物版本绑定；消除「子仓库 tag 触发发布」与「发布 tag 只在主仓库」的冲突。

**现状问题（执行前必须确认并修正）：**
- `release.yml` 的 `resolve-tag` 用 `grep -E '^gospeak-(server|desktop)-v[0-9]'` 写死两个组件，需改为四组件；
- `release.yml` 中「一个版本一个 Release：服务端二进制与桌面安装包都上传到它」的旧注释与「一组件一 Release」决策冲突，必须删除；
- Task 9 原写「子仓库 tag 不触发发布，发布 tag 只在主仓库」与 Task 7 原写「子仓库 release.yml 按自己 tag 发布」相互矛盾，已在 Task 7 / Task 9 修正为「子仓库只构建产物，主仓库统一打 tag 并创建 Release」。

**发布顺序（单一入口）：**

```
主仓库 version-bump 检测四组件版本变化
→ 打对应 annotated tag（gospeak-<component>-v<semver>）
→ 触发主仓库 release.yml（唯一创建 GitHub Release 的地方）
→ release.yml 按 component：
    server    → workflow_call GOSpeak-Web 的 release.yml 取前端压缩包；打包「二进制 + static/」
    web       → workflow_call GOSpeak-Web 的 release.yml 取前端压缩包，作为独立 Release 附件
    desktop   → workflow_call GOSpeak-Desktop 的 release.yml 取安装包
    mobile    → workflow_call GOSpeak-Mobile 的 release.yml 取 APK/IPA
→ 上传产物到该组件 Release；生成 checksums；发布说明由 metadata 驱动
```

**产物版本绑定（必须写入发布说明）：**
- server Release 的 `static/` 必须来自**同一次版本 bump 对应的 web gitlink 版本**；release.yml 从 tag 对应 commit 读取 `app/web` gitlink，传给 GOSpeak-Web workflow，禁止 `main` / `release` 分支浮动引用。
- 若 web 版本未变化但 server 版本变化，server 包复用当前 gitlink 对应的 web 版本，并在 Release 正文标注 `bundled-web: <version>`。
- 若 web 版本变化但 server 未变化，只发布 web 独立包；server 包不重发，运维可单独热更新前端。

**预发布 / rc 规则：**
- 四组件 tag 允许 `-rc.N` 预发布段，**rc 直接进入 latest 推荐**（调整策略，见 Task 15）：`system_update_service` 不过滤 rc；`release.yml` 不传 `--prerelease`；`build-mobile.yml` 去掉 `--prerelease`。
- SemVer 比较规则不变：`compareVersion` 仍判定同版本正式版 > rc（`1.2.3 > 1.2.3-rc.1`）；当 rc 是最高版本（如 `2.0.0-rc.1` > `1.9.0`）时即成为 latest，正式版发布后自动让位。
- 同一组件的 rc 与正式版可并存于 Releases 页，但 tag 唯一；正式版发布不删除 rc。
- 文档站部署是否跟随 rc latest 由 `docs.yml` 独立决定（当前 rc 不部署文档，保持与推荐版本解耦）。

- [ ] **Step 1: 写发布链路测试**

在 `scripts/release-naming.test.mjs` / `check-version.test.mjs` 增加：四组件 tag 解析（server/web/desktop/mobile）、子仓库 tag（如 `v1.0.0` 在 GOSpeak-Web 内）被拒绝作为发布 tag、`resolve-tag` 默认取最新 tag 时四组件均被识别。

Run: `node --test scripts/release-naming.test.mjs scripts/check-version.test.mjs`
Expected: FAIL（当前只识别两组件）。

- [ ] **Step 2: 修正 resolve-tag 与旧注释**

把 `release.yml` 的 `grep -E '^gospeak-(server|desktop)-v[0-9]'` 改为匹配四组件；删除「一个版本一个 Release」旧注释；确认 `create-release` 按 component 一组件一 Release。

Expected: `grep -n "server|desktop" .github/workflows/release.yml` 无命中（或仅保留合法组合）；actionlint 通过。

- [ ] **Step 3: 实现产物版本绑定与跨仓库调用**

release.yml 在 server / web 分支中从 tag commit 读取 `app/web` gitlink，通过 `workflow_call` inputs 传给对应子仓库 workflow；子仓库 checkout 到该 gitlink 的 commit 后构建，返回 artifact。禁止子仓库浮动引用分支。

Expected: server Release 附件 `static/` 中的 `index.html` 与该 web 版本产物一致；发布说明含 `bundled-web` 字段。

- [ ] **Step 4: 编写发布链路设计文档与提交**

创建 `docs/superpowers/specs/2026-11-25-release-pipeline-design.md`，覆盖单一发布入口、四组件顺序、产物绑定、rc 规则、子仓库只构建不发布。

```bash
git add .github/workflows/release.yml .github/workflows/version-bump.yml scripts/release-naming.mjs scripts/release-naming.test.mjs scripts/check-version.mjs scripts/check-version.test.mjs docs/superpowers/specs/2026-11-25-release-pipeline-design.md
 git commit -m "ci: unify release pipeline and bind frontend artifacts by gitlink"
```
Expected: 提交成功。

## Task 13: rc 进入 latest 推荐

**Files:**
- Modify: `app/server/internal/service/system_update_service.go` + `_test.go`（去掉 rc 过滤）
- Modify: `.github/workflows/release.yml`（删除误导性 latest 注释，确认不传 `--prerelease`）
- Modify: `.github/workflows/build-mobile.yml`（去掉 `--prerelease`）
- Modify: `docs/superpowers/specs/2026-11-25-submodule-release-design.md`（策略改为 rc 可 latest）

**Interfaces:**
- Consumes: Task 11（多仓库更新检测）、Task 12（发布链路统一）。
- Produces: rc 版本可被更新检测推荐；GitHub latest 可指向 rc。

**策略（与旧行为相反）：**
- 更新检测：移除 `fetchLatest` 中 `pre != ""` 的过滤；rc 按 SemVer 参与比较。
- 比较规则不变：`compareVersion` 仍保持「同版本正式版 > rc」，所以 `2.0.0-rc.1` 只在高于所有正式版（如 `1.9.0`）时成为 latest，`2.0.0` 发布后自动让位。
- 发布：`release.yml` 不传 `--prerelease`（最新 tag 自动成为 GitHub latest），删除旧注释；`build-mobile.yml` 删除 `--prerelease`。
- 文档站部署仍由 `docs.yml` 独立判断（rc 不部署文档），与 latest 推荐解耦。

- [ ] **Step 1: 写 rc 检测测试**

在 `system_update_service_test.go` 增加：只有 rc（如 `v2.0.0-rc.1`）时 `info.Latest` 应为 `2.0.0-rc.1`、`Available` 为 true；rc 与更高正式版并存时取最高正式版；同版本 rc 与正式版并存时取正式版。

Run: `go test ./internal/service/... -run TestSystemUpdate`
Expected: FAIL（当前过滤 rc）。

- [ ] **Step 2: 移除 rc 过滤**

删除 `fetchLatest` 中的 `if _, pre, ok := ...; !ok || pre != "" { continue }`，改为只校验版本可解析（`parseVersion` 返回 ok），保留 `compareVersion` 原逻辑。

Run: `go test ./internal/service/... -run TestSystemUpdate`
Expected: PASS。

- [ ] **Step 3: 调整发布 workflow 的 prerelease 标记**

`release.yml` 删除「Latest 只按发布先后决定」注释，改为明确「rc 与正式版都允许成为 latest」；确认 `gh release create` 未传 `--prerelease` / `--latest=false`。`build-mobile.yml` 删除 `--prerelease` 参数与相关注释。

Expected: `grep -r "prerelease" .github/workflows/release.yml .github/workflows/build-mobile.yml` 无有效参数命中（仅注释允许）。

- [ ] **Step 4: 更新文档并提交**

在 `2026-11-25-submodule-release-design.md` 写明 rc/latest 新策略；更新 `AGENTS.md` 若有相关描述。

```bash
git add app/server/internal/service .github/workflows/release.yml .github/workflows/build-mobile.yml docs/superpowers/specs/2026-11-25-submodule-release-design.md
 git commit -m "feat: allow release candidates to be recommended as latest"
```
Expected: 提交成功。

## Task 14: 回滚预案（仅在失败时执行）

**Files:** 无（操作任务）

**Interfaces:**
- Consumes: Task 1 的状态快照与 Task 5 的提交。
- Produces: 主仓库恢复到拆分前状态。

- [ ] **Step 1: 撤销 submodule 接入提交**

```bash
cd /Users/noelorin/Projects/GOSpeak
git revert <Task 5 commit sha>
```
Expected: `.gitmodules` 删除，三个目录恢复为普通文件。

- [ ] **Step 2: 恢复 pre-split 工作区提交或 stash**

若 Task 1 采用提交方案，确认该提交仍在历史中；若采用 stash，`git stash pop`。

Expected: 工作区恢复到拆分前状态。

- [ ] **Step 3: 删除远端子仓库（可选，谨慎）**

仅在确认不再需要时，用 `gh repo delete` 删除三个子仓库。

Expected: 远端清理完成。