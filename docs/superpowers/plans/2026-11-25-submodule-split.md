# 三端目录拆分为 Git Submodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/web`、`app/desktop`、`app/mobile` 三个目录从 GOSpeak 主仓库拆成独立 Git submodule，保留各自完整历史，路径与工具链不变。

**Architecture:** 在临时 clone 中用 `git filter-repo` 从主仓库历史抽取每个目录为独立仓库（子仓库根即原目录内容），推送到三个新远端仓库的 `release` 分支；主仓库处理完未提交改动后 `git rm -r --cached` 三个目录，再 `git submodule add` 回相同路径，提交 `.gitmodules` 与 gitlink。CI/发布 workflows 必须改造为 checkout with submodules，并把路径过滤器适配 gitlink 变化；子仓库各自建立轻量 CI。

**Tech Stack:** Git 2.x · git-filter-repo（或 git subtree split 退化）· GitHub · pnpm 10 · Turbo · Biome · Vitest 5 · Go 1.27

**Spec:** `docs/superpowers/specs/2026-11-25-submodule-split-design.md`

## Global Constraints

- 工作目录：`/Users/noelorin/Projects/GOSpeak`；主仓库远端：`https://github.com/NoelOrin/GOSpeak.git`；当前分支 `dev-1124`。
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
- **工具链/CI 因路径变化失效**：`pnpm typecheck`、`pnpm lint`、三目标构建、`pnpm test`、Go 构建必须全部通过；Task 7 逐条验证。
- **主仓库残留跟踪文件**：`git ls-files app/web app/desktop app/mobile` 在提交后只能返回三个 gitlink（mode 160000），不能列出目录内普通文件；Task 5 钉住。
- **clone 后不可复现**：全新 clone + `git submodule update --init --recursive` 后目录内容完整；Task 7 钉住。

---

## 文件结构

**新建**

| 文件 | 职责 |
|---|---|
| `docs/superpowers/specs/2026-11-25-submodule-split-design.md` | 设计文档（已创建） |
| `docs/superpowers/plans/2026-11-25-submodule-split.md` | 本计划 |
| `.gitmodules` | 三个 submodule 的 path/url/branch 声明，由 `git submodule add` 生成 |

**修改**

| 文件 | 改动 |
|---|---|
| `docs/superpowers/plans/README.md` | 索引新增本计划条目 |
| `AGENTS.md` | 目录骨架说明三端为 submodule；单一事实源索引补一句「子仓库地址见 `.gitmodules`」 |
| `docs/superpowers/specs/2026-11-25-submodule-split-design.md` | 决策点确认后回填最终选择（如子仓库地址、未提交改动处理方式） |

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

- [ ] **Step 3: 提交状态快照 artifact（可选但推荐）**

若采用先提交方案：
```bash
git add -A
git commit -m "chore: snapshot worktree before submodule split"
```
Expected: 提交成功；`git status --short` 干净（除本任务文档修改）。

若采用 stash 方案：
```bash
git stash push -m "pre-submodule-split"
```
Expected: `git stash list` 顶部出现该条目。

- [ ] **Step 4: 从最新 release 签出工作分支**

```bash
git fetch origin
git switch -c chore/submodule-split origin/release
```
Expected: `git branch --show-current` 输出 `chore/submodule-split`。

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
git clone --no-local /Users/noelorin/Projects/GOSpeak /tmp/gospeak-submodule-extract/web
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

## Task 7: CI / 发布 workflows 改造以适配 submodule

**Files:**
- Modify: `.github/workflows/ci.yml`（checkout submodules + 路径过滤器 + protocol-check）
- Modify: `.github/workflows/release.yml`、`.github/workflows/build-mobile.yml`、`.github/workflows/docker.yml`、`.github/workflows/docs.yml`、`.github/workflows/security.yml`、`.github/workflows/version-bump.yml`（checkout 加 submodules）
- Create: `docs/superpowers/specs/2026-11-25-submodule-ci-design.md`（子仓库自身 CI 策略说明）

**Interfaces:**
- Consumes: Task 5 的 submodule 结构；现有 workflows 内容。
- Produces: 主仓库 CI 能正确 checkout submodule 并按 gitlink 变化触发；供 Task 8 验证。

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

原命令 `git diff --exit-code -- ../web/src/protocol/generated` 在主仓库看不到子仓库内变化。改为校验子仓库 gitlink 未变化：
```bash
git diff --exit-code -- app/web
```
在 CI 中从 repo root 运行。

Expected: 命令在主仓库运行退出码 0；若子仓库内生成物变化但 gitlink 未更新，此检查不会报错——记录为已知限制，由子仓库自身 CI 覆盖。

- [ ] **Step 4: 改造其余 workflows checkout**

对 `release.yml`、`build-mobile.yml`、`docker.yml`、`docs.yml`、`security.yml`、`version-bump.yml` 中所有 `actions/checkout@v7` 加 `with: submodules: recursive`（已有 `with` 的合并进去）。

Expected: `grep -r "checkout@v7" .github/workflows/` 的每项都有 `submodules: recursive`。

- [ ] **Step 5: 建立子仓库自身 CI 策略文档**

创建 `docs/superpowers/specs/2026-11-25-submodule-ci-design.md`，说明：
- 主仓库 CI 是唯一合并门禁，三端子仓库的 PR 不单独设必过 gate（避免双重维护）。
- 子仓库 push 后，主仓库靠 Dependabot 或手动 `git submodule update --remote` 更新 gitlink，触发主仓库 CI。
- 每个子仓库可选加一个轻量 `workflow_call` 供主仓库按需触发，但不作为必过项。

Expected: 文档存在且包含上述三条。

- [ ] **Step 6: 提交 CI 改造**

```bash
git add .github/workflows/ docs/superpowers/specs/2026-11-25-submodule-ci-design.md
git commit -m "ci: checkout submodules and adapt path filters"
```
Expected: 提交成功。

- [ ] **Step 7: 验证 workflow 语法**

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

## Task 9: 回滚预案（仅在失败时执行）

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
