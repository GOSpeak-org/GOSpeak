# 多平台仓库结构调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/web`、`app/desktop`、`app/mobile`、`packages/` 四个目录从 GOSpeak 主仓库拆成独立 Git 仓库并以 submodule 接入，保留各自完整历史；各端拥有独立 Release（产物不再挤在同一个 Release 条目里）、独立 tag、独立 CI 与发版节奏。前端不再嵌入二进制，改为随发布包分发的外部静态目录并支持热更新；更新检测改为多仓库模型。

**Architecture:** 在临时 clone 中用 `git filter-repo` 从主仓库历史抽取每个目录为独立仓库（子仓库根即原目录内容），推送到四个新远端仓库的 `release` 分支；主仓库 `git rm -r --cached` 四个目录后 `git submodule add` 回相同路径。`GOSpeak-Web` 内部再嵌套挂载 `packages/` submodule（`GOSpeak-Packages`），使 `workspace:*` 与源码直连保持不变；`app/shared/proxyrules` 留主仓库，module 路径改为 `github.com/NoelOrin/GOSpeak/app/shared/proxyrules`，desktop 通过公开 Go module proxy 依赖。CI/发布 workflow 按仓库归属拆分，各子仓库独立 CI 与 Release；主仓库只负责 server、packages 的 module tag 与整体协调。版本声明改为分层 `metadata.yaml`，版本 bump 采用「子仓库改 metadata → 主仓库更新 metadata 与 gitlink」两阶段流程；`server`、`web`、`desktop`、`mobile` 各自独立 SemVer 与 tag，各自创建独立 GitHub Release。前端不再 `go:embed`：服务端只通过 `STATIC_DIR` / `/app/static` / `./static` 消费外部前端；桌面安装包内含外部前端目录。更新检测改为多仓库模型：`server` 查 GOSpeak 主仓库 `v*`，`web` 查 GOSpeak-Web `gospeak-web-v*`，`desktop` 查 GOSpeak-Desktop `gospeak-desktop-v*`，`mobile` 查 GOSpeak-Mobile `gospeak-mobile-v*`，各自独立缓存与降级。`serveSPA` 对 `index.html` 补 `Cache-Control: no-store`。

**Tech Stack:** Git 2.x · git-filter-repo（或 git subtree split 退化）· GitHub · pnpm 10 · Turbo · Biome · Vitest 5 · Go 1.27 · Gin（静态托管）

**Specs:**
- `docs/superpowers/specs/2026-11-25-submodule-split-design.md`
- `docs/superpowers/specs/2026-11-25-submodule-release-design.md`（Task 9 创建，含 web 外部更新规则）
- `docs/superpowers/specs/2026-11-25-release-pipeline-design.md`（Task 12 创建，一组件一 Release）
- `docs/superpowers/specs/2026-11-25-update-check-design.md`（Task 11 创建，多仓更新检测）

## Global Constraints

- 工作目录：`/Users/noelorin/Projects/GOSpeak`；主仓库远端：`https://github.com/NoelOrin/GOSpeak.git`；计划编写时当前分支 `dev-1124`，执行时在 `origin/release` 签出的短期工作分支上进行（本轮为 `feature/multiplatform-repo-restructure`）。
- 分支策略：从最新 `origin/release` 签出工作分支；唯一常驻分支为 `release`。
- 子仓库地址（可替换，但一旦确定必须全程一致）：
  - `https://github.com/NoelOrin/GOSpeak-Web.git`      → 主仓库 `app/web`
  - `https://github.com/NoelOrin/GOSpeak-Desktop.git`  → 主仓库 `app/desktop`
  - `https://github.com/NoelOrin/GOSpeak-Mobile.git`   → 主仓库 `app/mobile`
  - `https://github.com/NoelOrin/GOSpeak-Packages.git` → 主仓库 `packages`
- 子仓库默认分支：`release`。
- 子仓库结构：子仓库根即原目录内容，不保留 `app/web` / `packages` 这层前缀。
- **嵌套 submodule**：`GOSpeak-Web` 内挂 `packages/` → `GOSpeak-Packages`（路径 `packages`）；主仓库 `packages/` 同样是 submodule（同一远端），保证 web 在两种 checkout 场景下都能解析 `workspace:*`。
- **`app/shared/proxyrules` 留主仓库**，module 路径改为 `github.com/NoelOrin/GOSpeak/app/shared/proxyrules`，由 desktop 通过公开 proxy 依赖（主仓库为 public）。
- `git filter-repo` 只在临时 clone 中运行，**绝不**在主仓库工作区直接运行。
- 文件沙箱为 danger-full-access；审批已禁用，不要请求 sandbox 提权。
- 代码不加注释（复杂逻辑除外）、不用 emoji；提交遵循 Conventional Commits。
- 文档与代码同 PR；计划索引只保留仍在跟进的条目。

## Review Focus

- **当前未提交改动丢失**：`app/web` 内多个已修改文件在拆分前必须有显式落点（提交或 stash），且执行 `git rm -r --cached` 前再次核对 `git status`；Task 1 用状态快照与 diff 存档钉住。
- **子仓库历史缺失**：filter-repo 后子仓库 `git log` 必须包含原目录中至少一次真实提交（非仅初始空提交）；Task 3 用 log 抽样钉住。
- **submodule 路径漂移**：主仓库 `.gitmodules` 中四个 path 必须精确为 `app/web`、`app/desktop`、`app/mobile`、`packages`；`GOSpeak-Web` 的 `.gitmodules` 中 packages path 必须是 `packages`；Task 5 / Task 6b 用 `git config -f .gitmodules --get-regexp path` 钉住。
- **`workspace:*` 解析失败**：`GOSpeak-Web` 独立 clone 后 `pnpm install --frozen-lockfile` 必须成功，证明嵌套的 `packages/` 子模块已就位；Task 6b / Task 8 钉住。
- **跨仓依赖断裂**：desktop 必须能通过公开 proxy 拉到 `github.com/NoelOrin/GOSpeak/app/shared/proxyrules`；mobile 必须能拿到 web 的 `dist-mobile` 产物；Task 0 / Task 8 钉住。
- **工具链/CI 因路径变化失效**：`pnpm typecheck`、`pnpm lint`、三目标构建、`pnpm test`、Go 构建必须全部通过；Task 8 逐条验证。
- **主仓库残留跟踪文件**：`git ls-files app/web app/desktop app/mobile packages` 在提交后只能返回四个 gitlink（mode 160000）；Task 5 钉住。
- **clone 后不可复现**：全新 clone + `git submodule update --init --recursive` 后目录内容完整（含嵌套层）；Task 8 钉住。
- **各端 Release 仍挤在一起**：若 `create-release` 仍固定用 server tag，则拆分未达成目标；Task 12 钉住「一组件一 Release」。

---

## 文件结构

**新建**

| 文件 | 职责 |
|---|---|
| `docs/superpowers/specs/2026-11-25-submodule-split-design.md` | 设计文档（已创建） |
| `docs/superpowers/plans/2026-11-25-submodule-split.md` | 本计划 |
| `docs/superpowers/specs/2026-11-25-submodule-ci-design.md` | 子仓库 CI 策略说明（Task 7） |
| `docs/superpowers/specs/2026-11-25-submodule-release-design.md` | 版本与发布规则说明（Task 9） |
| `metadata.yaml`（主仓库 + 四个子仓库各一份） | 版本与元数据的分层单一事实源（Task 9）；含 `server`/`web`/`desktop`/`mobile` 四组件 |
| `scripts/metadata.mjs` + `.test.mjs` | metadata.yaml 解析与一致性校验（Task 9） |
| `.gitmodules`（主仓库） | 四个 submodule 的 path/url/branch 声明 |
| `.gitmodules`（GOSpeak-Web） | 嵌套 `packages` submodule 声明（Task 6b） |

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
| `app/web/src/api/system.ts` + `app/web/src/components/modal/settingModal/tab_item/about.tsx` | 前端新增 web 前端更新检测入口与展示（Task 11） |
| `app/shared/proxyrules/go.mod` | module 路径改为 `github.com/NoelOrin/GOSpeak/app/shared/proxyrules`（Task 0） |
| `app/desktop/go.mod` | 删除 `replace gospeak/proxyrules => ../shared/proxyrules`，改为公开 module 依赖（Task 0） |
| `app/desktop/*.go` | import 路径改为新 module 路径（Task 0） |
| `scripts/mobile-bind-proxyrules.mjs` | `MODULE_DIR` 与 go.mod 路径适配新 module 路径（Task 0） |
| `app/server/cmd/gen-protocol/main.go` | 生成目标路径参数化，跨仓写入改为输出到指定目录（Task 0） |
| `app/mobile/capacitor.config.ts` | `webDir` 改为本地相对路径（mobile 内自取产物，Task 0） |
| `app/desktop/mygo.config.ts` | 前端产物来源改为本地相对路径（Task 0） |
| `scripts/check-desktop-commands.mjs` / `check-mobile-bridge.mjs` / `mobile-version.mjs` | 路径按仓库归属拆分或参数化（Task 7） |
| `pnpm-workspace.yaml` / `turbo.json` / `lefthook.yml` / `biome.json` | 移除或适配被拆出目录的路径（Task 7） |

**删除（从主仓库 index 移除，文件由 submodule checkout 重建）**

| 路径 | 说明 |
|---|---|
| `app/web/**` | 由 `git rm -r --cached app/web` 移除跟踪，改由 submodule 提供 |
| `app/desktop/**` | 同上 |
| `app/mobile/**` | 同上 |
| `packages/**` | 同上（远端 `GOSpeak-Packages`） |

---

## Task 0: 前置依赖改造（拆仓前必须先做）

**Files:**
- Modify: `app/shared/proxyrules/go.mod`（module 路径）
- Modify: `app/desktop/go.mod` + `app/desktop/*.go`（依赖方式与 import）
- Modify: `scripts/mobile-bind-proxyrules.mjs`（路径适配）
- Modify: `app/server/cmd/gen-protocol/main.go`（输出路径参数化）
- Modify: `app/mobile/capacitor.config.ts` / `app/mobile/package.json`（前端产物来源）
- Modify: `app/desktop/mygo.config.ts`（前端产物来源）
- Modify: `AGENTS.md`（记录 proxyrules module 新路径）

**Interfaces:**
- Consumes: 当前同仓结构。
- Produces: 跨仓依赖在拆分前已可独立成立；供 Task 3/5/6b 直接使用。

**为什么先做：** 这三项是拆仓后的硬断点，先在同仓内改成「可跨仓」形态并验证通过，拆仓才不会连锁失败。

- [ ] **Step 1: 改 proxyrules module 路径**

把 `app/shared/proxyrules/go.mod` 的 `module gospeak/proxyrules` 改为 `module github.com/NoelOrin/GOSpeak/app/shared/proxyrules`。同步改 `app/desktop` 三处 import（`proxyserver.go`、`server_config.go`、`proxyserver_security_test.go`）与 `scripts/mobile-bind-proxyrules.mjs` 的 module 引用。

Run:
```bash
cd app/shared/proxyrules && go build ./... && go test ./...
cd ../../desktop && go build ./... && go test ./...
node --test scripts/mobile-bind-proxyrules.test.mjs
```
Expected: 全部通过。

- [ ] **Step 2: desktop 改用公开 module 依赖**

先在主仓库为 proxyrules 打 module 子目录 tag（Go 子模块版本规范）：
```bash
git tag app/shared/proxyrules/v0.1.0
git push origin app/shared/proxyrules/v0.1.0
```
然后把 `app/desktop/go.mod` 的 `require gospeak/proxyrules v0.0.0` 改为 `require github.com/NoelOrin/GOSpeak/app/shared/proxyrules v0.1.0`，删除 `replace` 行，执行 `go mod tidy`。

**关于下载体积（已实测确认）**：Go 的 module proxy 对子目录 module **只打包该子目录**，不会拉整个仓库。以 `golang.org/x/tools/gopls`（x/tools 的子目录 module）为例，其 zip 为 2.4MB / 1204 文件，内容全部位于 `gopls@v<ver>/` 下，不含 x/tools 的其他目录。因此 `proxyrules`（4 个文件）的下载量可忽略。

Run: `cd app/desktop && go mod tidy && go build ./...`
Expected: 能从 `proxy.golang.org` 解析到该 module；构建通过。

- [ ] **Step 2b: 确认 GOTOOLCHAIN 兼容**

`proxyrules` 声明 `go 1.26.0`，desktop 声明 `go 1.27.4`，本机默认可能是更低版本。验证自动工具链切换生效：

```bash
go env GOTOOLCHAIN
cd app/desktop && go version
```
Expected: `GOTOOLCHAIN` 为 `auto`（或 `local+auto`）；`go version` 在 desktop 目录下报告 ≥ 1.27。若不是，需在 CI 与本地显式设置 `GOTOOLCHAIN=auto` 并在设计文档记录。

- [ ] **Step 3: gen-protocol 输出路径参数化**

给 `app/server/cmd/gen-protocol` 增加 `-out` 参数（默认保持当前 `../web/src/protocol/generated`），使跨仓 CI 可指定输出目录；契约测试 `protocol/gen_contract_test.go` 相应读取该参数或保持 golden 比对。

Run: `cd app/server && go test ./internal/protocol/...`
Expected: 通过；`go run ./cmd/gen-protocol -out /tmp/gen-test` 能写到指定目录。

- [ ] **Step 4: 前端产物来源本地化**

把 `app/mobile/capacitor.config.ts` 的 `webDir: "../web/dist-mobile"` 改为 `"www"`（mobile 仓库内目录），`package.json` 的 `sync` 脚本改为消费外部传入的产物（拆仓后由 CI 把 web 产物放进 `www/`）。同理 `app/desktop/mygo.config.ts` 的 `buildCommand` 改为消费本地 `webui/dist`（由 CI 预置），不再 `cp ../web/dist`。

Run: `pnpm --filter @gospeak/web build:mobile && pnpm --filter @gospeak/mobile sync`
Expected: 通过（此时仍在同仓，用脚本先拷产物到本地目录再 sync）。

- [ ] **Step 5: 提交前置改造**

```bash
git add app/shared app/desktop app/mobile app/server/cmd/gen-protocol scripts/mobile-bind-proxyrules.mjs AGENTS.md
git commit -m "refactor: make cross-repo dependencies resolvable before submodule split"
```
Expected: 提交成功。

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

## Task 2: 创建四个远端空仓库

**Files:** 无本地文件（GitHub 远端操作）

**Interfaces:**
- Consumes: Task 1 确认的子仓库地址。
- Produces: 四个可推送的空仓库；供 Task 3 推送。

- [ ] **Step 1: 创建空仓库**

在 GitHub 上创建四个仓库（用 `gh` CLI 或网页），均不初始化 README/LICENSE/.gitignore：
```bash
gh repo create NoelOrin/GOSpeak-Web --private --confirm
gh repo create NoelOrin/GOSpeak-Desktop --private --confirm
gh repo create NoelOrin/GOSpeak-Mobile --private --confirm
gh repo create NoelOrin/GOSpeak-Packages --private --confirm
```
Expected: 四个 `gh repo view` 均成功。

- [ ] **Step 2: 验证远端可写**

```bash
for r in Web Desktop Mobile Packages; do git ls-remote "https://github.com/NoelOrin/GOSpeak-$r.git"; done
```
Expected: 四条命令均成功（空仓库无输出或仅 HEAD）。

---

## Task 3: 抽取四个目录历史到子仓库

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

- [ ] **Step 6: 抽取 packages**

```bash
rm -rf /tmp/gospeak-submodule-extract/packages
git clone --no-local --branch chore/submodule-split /Users/noelorin/Projects/GOSpeak /tmp/gospeak-submodule-extract/packages
cd /tmp/gospeak-submodule-extract/packages
git filter-repo --path packages --path-rename packages/: --force
git checkout -b release
git remote add origin https://github.com/NoelOrin/GOSpeak-Packages.git
git push -u origin release
```

Expected: 子仓库根出现 `components/`、`sfu-client/`、`desktop/`、`mobile-capabilities/`；历史非空。

- [ ] **Step 7: 验证 packages 历史**

```bash
cd /tmp/gospeak-submodule-extract/packages
git log --oneline -5
git ls-tree -d HEAD --name-only
```
Expected: 至少 3 条真实历史提交；根目录含四个包目录。

- [ ] **Step 8: 清理临时 clone**

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

- [ ] **Step 2: 从 index 移除四个目录（保留本地文件用于比对）**

```bash
git rm -r --cached app/web app/desktop app/mobile packages
```
Expected: 命令成功；`git status --short` 显示大量 `D  app/web/...` 等删除条目。

- [ ] **Step 3: 删除本地目录内容**

```bash
rm -rf app/web app/desktop app/mobile packages
```
Expected: 四个目录不存在。

- [ ] **Step 4: 验证 index 无普通文件残留**

```bash
git ls-files app/web app/desktop app/mobile packages | head -20
```
Expected: 输出为空。

---

## Task 5: 添加四个 submodule 并锁定指针

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

- [ ] **Step 3b: 添加 packages submodule**

```bash
git submodule add -b release https://github.com/NoelOrin/GOSpeak-Packages.git packages
```
Expected: `packages` 目录重新出现且含四个包目录。

- [ ] **Step 4: 验证 .gitmodules 路径精确**

```bash
git config -f .gitmodules --get-regexp 'submodule\..*\.path'
git config -f .gitmodules --get-regexp 'submodule\..*\.url'
```
Expected: 四条 path 精确为 `app/web`、`app/desktop`、`app/mobile`、`packages`；url 与 Task 2 一致。

- [ ] **Step 5: 验证 gitlink 模式**

```bash
git ls-files -s app/web app/desktop app/mobile packages
```
Expected: 四行 mode 均为 `160000`，即 gitlink。

- [ ] **Step 6: 提交 submodule 接入**

```bash
git add .gitmodules app/web app/desktop app/mobile packages
git commit -m "refactor: split web desktop mobile and packages into git submodules"
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
| [多平台仓库结构调整](./2026-11-25-submodule-split.md) | 进行中 | 待验证四仓 submodule 全量门禁 |
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

## Task 6B: GOSpeak-Web 嵌套挂载 packages

**Files:**
- Modify: `GOSpeak-Web` 仓库：新增 `.gitmodules`、`pnpm-workspace.yaml`、`package.json`
- Modify: `GOSpeak-Web` 的 `web/package.json`（`workspace:*` 保持不变，仅确认可解析）

**Interfaces:**
- Consumes: Task 3 的 `GOSpeak-Packages` 远端；Task 5 的主仓库 submodule 结构。
- Produces: `GOSpeak-Web` 独立 clone 后能 `pnpm install` 并构建；供 Task 7/8 验证。

**为什么需要：** `app/web` 依赖 4 个 `packages/*` 包（`workspace:*`，211 处引用）。拆仓后这些包必须与 web 同处一个 pnpm workspace，否则 `pnpm install` 直接失败。

- [ ] **Step 1: 在 GOSpeak-Web 中调整目录布局**

**不要用 `git mv` 批量移动**（不接受多个源路径，且 `|| true` 会吞掉失败）。用 `git filter-repo` 在临时 clone 中重写路径最可靠：

```bash
rm -rf /tmp/gospeak-web-setup
git clone https://github.com/NoelOrin/GOSpeak-Web.git /tmp/gospeak-web-setup
cd /tmp/gospeak-web-setup
git filter-repo --to-subdirectory-filter web --force
```
`--to-subdirectory-filter web` 会把所有文件移到 `web/` 下并重写历史路径。

Expected: 仓库根只剩 `web/` 与 `.git`；`ls web/` 含 `src/`、`package.json`、`vite.config.ts`。

- [ ] **Step 2: 添加 packages 嵌套 submodule**

```bash
git submodule add -b release https://github.com/NoelOrin/GOSpeak-Packages.git packages
```
Expected: `packages/` 出现且含四个包目录；`.gitmodules` 中 path 为 `packages`。

- [ ] **Step 3: 配置 workspace 与根 package.json**

`pnpm-workspace.yaml`：
```yaml
packages:
  - "web"
  - "packages/*"
```

根 `package.json` 保留 turbo/biome 等工具链依赖，scripts 指向 `web`。把原主仓库的 `turbo.json`、`biome.json`、`tsconfig` 基座同步过来。

Expected: `pnpm install --frozen-lockfile` 可解析全部依赖。

- [ ] **Step 4: 验证独立构建**

```bash
cd /tmp/gospeak-web-setup
pnpm install --frozen-lockfile
pnpm --filter @gospeak/web build
pnpm --filter @gospeak/web test
```
Expected: 构建与测试通过，证明 `workspace:*` 已正确解析。

- [ ] **Step 5: 提交并推送**

```bash
git add .gitmodules packages pnpm-workspace.yaml package.json turbo.json biome.json web
git commit -m "refactor: nest packages submodule and configure workspace"
git push origin release
```
Expected: 推送成功；`git submodule status` 显示 packages 指针。

- [ ] **Step 6: 更新主仓库 gitlink**

回到主仓库，把 `app/web` 的 gitlink 指向新的提交（目录布局变化后 commit 不同）：
```bash
cd /Users/noelorin/Projects/GOSpeak
git submodule update --remote app/web
git add app/web && git commit -m "chore: bump web submodule to nested packages layout"
```
Expected: 主仓库 `app/web` gitlink 更新。

---

## Task 7: CI 按仓库归属拆分（各端 CI 迁回各自子仓库）

**Files:**
- Modify: `.github/workflows/ci.yml`（checkout submodules + 路径过滤器 + protocol-check；移除三端专属 job）
- Modify: `.github/workflows/release.yml`（移除 build-web / build-desktop* / desktop-checksums；仅保留 server 与协调）
- Delete: `.github/workflows/build-mobile.yml`（迁移到 GOSpeak-Mobile）
- Modify: `.github/workflows/docker.yml`、`.github/workflows/docs.yml`、`.github/workflows/security.yml`、`.github/workflows/version-bump.yml`（checkout 加 submodules；移除三端相关步骤）
- Create: `docs/superpowers/specs/2026-11-25-submodule-ci-design.md`（CI 归属矩阵与触发规则）
- 在四个子仓库中 Create: `.github/workflows/ci.yml`（各自独立 CI）与 `.github/workflows/release.yml`（各自独立 Release；由 Task 3 的子仓库提交落地）

**Interfaces:**
- Consumes: Task 5 的 submodule 结构；现有 workflows 内容。
- Produces: 每端 CI 在各自仓库运行；主仓库 CI 只负责 server 与跨仓协调；供 Task 8 验证。

**CI 归属矩阵（写入设计文档）：**

| 工作流 | 所属仓库 | 职责 |
|---|---|---|
| CI（server / Go / scripts / protocol / 集成测试） | GOSpeak 主仓库 | 只跑 `app/server`、`app/shared`、`scripts`、`test`、`deploy`；不再构建三端 |
| CI（lint / typecheck / test / build web） | GOSpeak-Web | 前端与嵌套 packages 的质量门禁；生成物 `dist/` 由本仓 release 打包 |
| CI（packages 单元测试） | GOSpeak-Packages | 四个 workspace 包自身的 test / typecheck / build |
| CI（Go / mygo build / 安装包） | GOSpeak-Desktop | 桌面宿主自身门禁与安装包构建 |
| CI（Capacitor sync / gradle / xcode） | GOSpeak-Mobile | 移动壳自身门禁与 APK/IPA 构建 |
| Release（server / Docker） | GOSpeak 主仓库 | 只发布 server 产物；消费 web 压缩包打进 `static/` |
| Release（web 静态包） | GOSpeak-Web | 独立 Release `gospeak-web-v*`，产物为前端压缩包 |
| Release（desktop 安装包） | GOSpeak-Desktop | **独立 Release** `gospeak-desktop-v*`，产物为 dmg/deb/exe/install.sh |
| Release（mobile 安装包） | GOSpeak-Mobile | **独立 Release** `gospeak-mobile-v*`，产物为 APK/IPA |
| Release（packages module） | GOSpeak 主仓库 | 只打 Go module tag `app/shared/proxyrules/v*`；packages 无独立 Release |

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

从 `ci.yml` 删除 `build-js`、`test-web`、`test-packages`、`desktop-go` 三端专属 job 及 `gate` 中对应 needs；`lint` 的 biome 路径去掉 `./app/web` / `./app/desktop` / `./app/mobile` / `./packages`；`typecheck` 只保留主仓库 `scripts`。从 `release.yml` 删除 `build-web`、`build-desktop-macos`、`build-desktop-others`、`desktop-checksums` 及所有向 `webui/dist` 拷贝前端产物的步骤；删除 `build-mobile.yml`。

同时清理主仓库工具链配置中对已拆出目录的引用：
- `pnpm-workspace.yaml`：`app/*` / `packages/*` 改为只剩 `test`（主仓库不再有前端包）
- `turbo.json`：`globalDependencies` 移除 `app/*/tsconfig*.json`、`packages/*/tsconfig*.json`
- `lefthook.yml` / `biome.json`：移除 `./app/web`、`./app/desktop`、`./app/mobile`、`./packages` 路径
- `scripts/check-desktop-commands.mjs`、`check-mobile-bridge.mjs`、`mobile-version.mjs`：迁移到对应子仓库，主仓库删除

Expected: `grep -rn "app/web\|app/desktop\|app/mobile\|packages/" .github/workflows/ pnpm-workspace.yaml turbo.json lefthook.yml biome.json` 仅剩 gitlink 路径与 checkout 配置。

- [ ] **Step 6: 在四个子仓库建立独立 CI / Release**

各子仓库建立**独立 CI 与独立 Release**（这是本次拆分的核心目标：产物分开管理）：

- **GOSpeak-Web**：`ci.yml`（lint / typecheck / vitest / build）；`release.yml` 由 tag `gospeak-web-v*` 触发，构建并发布前端静态压缩包到**自己的 Release**。
- **GOSpeak-Packages**：`ci.yml`（四包 test / typecheck / build），无 Release。
- **GOSpeak-Desktop**：`ci.yml`（go vet / go test / mygo build）；`release.yml` 由 tag `gospeak-desktop-v*` 触发，发布安装包到**自己的 Release**。
- **GOSpeak-Mobile**：`ci.yml`（capacitor sync / gradle / xcode）；`release.yml` 由 tag `gospeak-mobile-v*` 触发，发布 APK/IPA 到**自己的 Release**。

**发布 tag 归属（修订）**：每个子仓库打自己的发布 tag（`gospeak-web-v*` / `gospeak-desktop-v*` / `gospeak-mobile-v*`）并创建自己的 Release。主仓库只保留 server 的 tag 与 Release。各仓 tag 格式统一为 `gospeak-<component>-v<semver>`，由 `release-naming.mjs` 派生。这样 Releases 页面按仓库天然分开，不再挤在一起。

Expected: 四个子仓库各自的 `.github/workflows/` 有 ci.yml 与 release.yml；主仓库无 `build-mobile.yml`。

- [ ] **Step 7: 建立 CI 归属设计文档**

创建 `docs/superpowers/specs/2026-11-25-submodule-ci-design.md`，写入「CI 归属矩阵」、触发规则（子仓库 push/tag 触发自身 CI/Release；主仓库靠 gitlink 更新触发自身 CI）、主仓库不再承担三端构建、**各仓独立 Release 使产物天然分开**。

Expected: 文档存在且包含归属矩阵全部核心行，明确写出「各端 Release 独立、产物不再混在同一 Release 条目」。

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

- [ ] **Step 1: 校验 submodule 状态（含嵌套层）**

```bash
cd /Users/noelorin/Projects/GOSpeak
git submodule status
cd app/web && git submodule status
```
Expected: 主仓库四行、web 内一行，均以空格开头（无 `+` / `-` 前缀）。

- [ ] **Step 2: 主仓库门禁**

```bash
pnpm test:scripts
node --test scripts/*.test.mjs
```
Expected: 全部退出码 0。

- [ ] **Step 3: GOSpeak-Web 独立验证**

```bash
cd /tmp/gospeak-web-verify
pnpm install --frozen-lockfile
pnpm --filter @gospeak/web typecheck
pnpm --filter @gospeak/web test
pnpm --filter @gospeak/web build
pnpm --filter @gospeak/web build:desktop
pnpm --filter @gospeak/web build:mobile
```
Expected: 独立 clone 后 `workspace:*` 正常解析，三个目标均构建成功。

- [ ] **Step 4: GOSpeak-Packages 独立验证**

```bash
cd /tmp/gospeak-packages-verify
pnpm install --frozen-lockfile
pnpm -r test
pnpm -r typecheck
```
Expected: 四包测试与类型检查通过。

- [ ] **Step 5: Go 门禁与服务端测试**

```bash
cd /Users/noelorin/Projects/GOSpeak
go vet ./app/server/... ./app/shared/...
pnpm test:server:go
```
Expected: 全部成功。

- [ ] **Step 6: 跨仓依赖验证**

```bash
cd /tmp/gospeak-desktop-verify && go mod download && go build ./...
```
Expected: desktop 能从公开 proxy 拉到 `github.com/NoelOrin/GOSpeak/app/shared/proxyrules`；构建通过。

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
- Create: `metadata.yaml`（四个子仓库各自一份，通过 Task 3 的子仓库提交落地；packages 无 release 但保留 version）
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
    release: true              # 产物由 GOSpeak-Mobile 自己的 release.yml 发布
  packages:
    version: 1.0.0
    source: packages           # git submodule
    metadata_ref: packages/metadata.yaml
    release: false             # 仅作为 web 的 workspace 依赖，不单独发 Release
```

**Release 归属（四仓模型）：**

| 组件 | 发布仓库 | Release tag | 产物 |
|---|---|---|---|
| server | GOSpeak | `gospeak-server-v*` | 二进制 + `static/` |
| web | GOSpeak-Web | `gospeak-web-v*` | 前端静态压缩包 |
| desktop | GOSpeak-Desktop | `gospeak-desktop-v*` | dmg / deb / exe / install.sh |
| mobile | GOSpeak-Mobile | `gospeak-mobile-v*` | APK / IPA |
| packages | —（不发 Release） | — | 仅 workspace 依赖 |

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
- **版本号不统一发布**：server / web / desktop / mobile 四组件各自独立 SemVer，互不跟随；packages 有独立 version 但不发布。
- 版本 bump 只针对发生变更的组件：先改该子仓库 `metadata.yaml` 与版本文件并 commit/push，再更新主仓库总控 `metadata.yaml` 的 `version` 与 `tag`，最后更新 gitlink 并打 tag。
- 每个组件独立 tag / **独立 Release（在自己的仓库里）** / 独立 changelog；彻底消除「一版一个 Release、产物挤在一起」的旧模型。
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

在 Task 3 抽取后、Task 5 接入前，把子仓库 `metadata.yaml` 作为子仓库首提交的一部分（或单独提交）推送。四个子仓库各自文件见上方结构。

Expected: 每个子仓库根目录有 `metadata.yaml` 且 `component` 字段正确。

- [ ] **Step 12: 编写版本与元数据设计文档**

创建 `docs/superpowers/specs/2026-11-25-submodule-release-design.md`，覆盖：方案 C 分层模型、metadata 字段结构、独立发布规则、metadata ↔ tag 双向一致性、tag 存在性驱动发布（幂等）、删除 lockstep 约束、两阶段按组件 bump、子仓库 commit 约定、mobile 独立构建原因、gitlink 与版本解耦。

Expected: 文档存在且包含上述七点。

- [ ] **Step 13: 更新 AGENTS.md 文档**

`scripts/AGENTS.md`：新增 `metadata.mjs` 行；`check-version.mjs` 描述改为读 metadata；`release-naming.mjs` 改四组件（含 web）；新增设计文档指针。根 `AGENTS.md` §6 补「版本与元数据以 metadata.yaml 为单一事实源，四组件独立发布」。设计文档 `2026-11-25-submodule-release-design.md` 必须包含 web 静态包发布与外部 `STATIC_DIR` 更新规则、embed 兜底关系。

Expected: `grep -n "metadata.yaml" scripts/AGENTS.md AGENTS.md` 有命中；`grep -n "STATIC_DIR" docs/superpowers/specs/2026-11-25-submodule-release-design.md` 有命中。

- [ ] **Step 14: web 静态压缩包构建落在 GOSpeak-Web 自己的 release.yml**

**不在主仓库构建 web 产物。** 在 `GOSpeak-Web` 仓库的 `release.yml` 中：由 tag `gospeak-web-v*` 触发，`pnpm install --frozen-lockfile` → `pnpm --filter @gospeak/web build`，把 `web/dist/` 打包为 `gospeak-web-v<version>.tar.gz`，上传到**该仓库自己的 Release**。产物命名走 `release-naming.mjs` 派生。

主仓库的 `release.yml` 只在构建 server 产物时需要前端：从 `gospeak-web-v<对应版本>` 的 Release 下载压缩包，解压进 `static/`。

Expected: GOSpeak-Web 打 tag 后，**在 GOSpeak-Web 仓库的 Releases 页**出现 `gospeak-web-v<version>` 条目与压缩包附件；主仓库 Releases 页无 web 条目。

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

## Task 12: 发布链路改造为一组件一 Release（各在自己仓库）

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
- `release.yml:126-129` 的注释「一个版本只创建一个 GitHub Release：tag 固定为服务端 tag，服务端二进制与桌面端安装包都上传到它」——**这正是「产物挤在一起」的病根，必须删除并改为各仓独立 Release**；
- `create-release` 的 `release_tag` 硬编码 `release-naming.mjs tag server`（`release.yml:157`），导致任何组件触发都建到 server tag 上；
- `desktop_included` 逻辑（`release.yml:204-214`）把桌面下载表格塞进 server Release 正文，拆分后应删除；
- 产物上传目标用的是 `needs.create-release.outputs.release_tag`（`release.yml:592/759/824`），拆分后应改为各自仓库自己的 tag。

**目标模型：一组件一 Release，各在自己仓库。**

```
主仓库（GOSpeak）
  server tag gospeak-server-v*  → 主仓库 release.yml → 主仓库 Release（二进制 + static/）
  proxyrules module tag          → 仅 Go module，无 Release

GOSpeak-Web
  web tag gospeak-web-v*        → 本仓 release.yml → 本仓 Release（前端压缩包）

GOSpeak-Desktop
  desktop tag gospeak-desktop-v* → 本仓 release.yml → 本仓 Release（dmg/deb/exe/install.sh）

GOSpeak-Mobile
  mobile tag gospeak-mobile-v*  → 本仓 release.yml → 本仓 Release（APK/IPA）
```

**产物版本绑定：**
- server 包的 `static/` 来自 tag commit 上的 `app/web` gitlink 所指版本；release.yml 读 gitlink 的 commit，去 GOSpeak-Web 找对应 tag 的 Release 附件（`gospeak-web-v<version>.tar.gz`）下载解压，禁止浮动引用分支。
- web 版本未变而 server 变：server 包复用当前 gitlink 对应的 web 版本，Release 正文标注 `bundled-web: <version>`。
- web 变而 server 未变：只发 web 独立 Release；运维可单独热更新前端，无需动 server。

**预发布 / rc 规则：**
- 四组件 tag 允许 `-rc.N` 预发布段，**rc 直接进入 latest 推荐**（调整策略，见 Task 15）：`system_update_service` 不过滤 rc；`release.yml` 不传 `--prerelease`；`build-mobile.yml` 去掉 `--prerelease`。
- SemVer 比较规则不变：`compareVersion` 仍判定同版本正式版 > rc（`1.2.3 > 1.2.3-rc.1`）；当 rc 是最高版本（如 `2.0.0-rc.1` > `1.9.0`）时即成为 latest，正式版发布后自动让位。
- 同一组件的 rc 与正式版可并存于 Releases 页，但 tag 唯一；正式版发布不删除 rc。
- 文档站部署是否跟随 rc latest 由 `docs.yml` 独立决定（当前 rc 不部署文档，保持与推荐版本解耦）。

- [ ] **Step 1: 写发布链路测试**

在 `scripts/release-naming.test.mjs` / `check-version.test.mjs` 增加：四组件 tag 解析（server/web/desktop/mobile）、子仓库 tag（如 `v1.0.0` 在 GOSpeak-Web 内）被拒绝作为发布 tag、`resolve-tag` 默认取最新 tag 时四组件均被识别。

Run: `node --test scripts/release-naming.test.mjs scripts/check-version.test.mjs`
Expected: FAIL（当前只识别两组件）。

- [ ] **Step 2: 删除「统一 Release」逻辑，改为按组件建 Release**

关键改动（`release.yml`）：
1. 删除 `release.yml:126-129` 的统一 Release 注释；
2. `create-release` 的 `release_tag` 改为 `${{ needs.resolve-tag.outputs.tag }}`（哪个组件触发就用哪个 tag），删除硬编码的 `tag server`；
3. 删除 `desktop_included` 相关逻辑（`release.yml:204-214`）与 `--desktop-included` / `--desktop-notes-file` 参数；
4. 主仓库 `release.yml` 只保留 `if: needs.resolve-tag.outputs.component == 'server'` 的构建分支；web/desktop/mobile 的构建与发布**整体迁移到各自仓库的 `release.yml`**；
5. `resolve-tag` 的 `grep -E '^gospeak-(server|desktop)-v[0-9]'` 改为只匹配 `^gospeak-server-v[0-9]`（主仓库只管 server）。

Expected: 主仓库 `release.yml` 中不再出现 desktop/mobile 构建 job；`grep -n "desktop_included" .github/workflows/release.yml` 无命中。

- [ ] **Step 3: 子仓库各自建 Release**

在三个有 Release 的子仓库（Web / Desktop / Mobile）的 `release.yml` 中分别实现：
- 触发：`on.push.tags: ['gospeak-web-v*']` / `['gospeak-desktop-v*']` / `['gospeak-mobile-v*']`
- 创建 Release：`gh release create "$TAG" --title "..." --notes-file ...`（tag 即本仓 tag）
- 上传产物：web 传 `.tar.gz`，desktop 传安装包 + SHA256SUMS，mobile 传 APK/IPA

Expected: 三个子仓库各自 Releases 页出现本组件的独立条目，产物不再混入主仓库 Release。

- [ ] **Step 4: server 包从 web Release 取前端产物**

主仓库 `release.yml` 构建 server 时：从 tag commit 读 `app/web` gitlink 的 commit SHA → 查 GOSpeak-Web 中该 commit 对应的 `gospeak-web-v<version>` tag → 用 `gh release download` 拉压缩包 → 解压进 `static/` 后打进 server 产物。

Expected: server Release 附件 `static/index.html` 与该 web 版本产物一致；发布说明含 `bundled-web: <version>`。

- [ ] **Step 5: 编写发布链路设计文档与提交**

创建 `docs/superpowers/specs/2026-11-25-release-pipeline-design.md`，覆盖：**一组件一 Release（各在自己仓库）**、四个 Release 的触发与产物清单、server 包的前端产物绑定方式、rc 规则、以及「Releases 页面按仓库天然分开」的验证方法。

```bash
git add .github/workflows/release.yml .github/workflows/version-bump.yml scripts/release-naming.mjs scripts/release-naming.test.mjs scripts/check-version.mjs scripts/check-version.test.mjs docs/superpowers/specs/2026-11-25-release-pipeline-design.md
 git commit -m "ci: one release per component in its own repository"
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
Expected: `.gitmodules` 删除，四个目录恢复为普通文件。

- [ ] **Step 2: 恢复 pre-split 工作区提交或 stash**

若 Task 1 采用提交方案，确认该提交仍在历史中；若采用 stash，`git stash pop`。

Expected: 工作区恢复到拆分前状态。

- [ ] **Step 3: 删除远端子仓库（可选，谨慎）**

仅在确认不再需要时，用 `gh repo delete` 删除四个子仓库。

Expected: 远端清理完成。