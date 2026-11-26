# Release 产物分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个组件拥有独立的 GitHub Release 条目，产物不再混在一起。当前 `gospeak-server-v1.3.0-rc.1` 一个 Release 里塞了 20 个附件（10 个 server 二进制 + 7 个桌面安装包 + install.sh + 2 个 SHA256SUMS），难以管理与分发。

**Architecture:** 不拆仓库、不动目录结构。根因是 `release.yml` 里 `create-release` 硬编码了 server tag（第 157 行），导致任何组件触发都建到 server 的 Release 上；同时 `desktop_included` 逻辑（第 204-214 行）把桌面下载表格注入 server Release 正文。改为「哪个组件触发，就在哪个组件的 tag 上建 Release，只上传该组件产物」。配套删除 `version-bump.yml` 的 lockstep 同版本约束——它正是「产物挤在一个 Release」逼出来的。

**Tech Stack:** GitHub Actions · Node（scripts/*.mjs，零依赖）· Go 1.27

**背景决策记录：** 本计划原为「四端拆成独立 Git 仓库」方案，经多 agent review 后放弃。核心理由：拆仓会让 CI 从并行 13 job 变成跨仓串行，一次前端改动需 2 轮 CI + 人工 bump gitlink，速度慢 2-3 倍；且跨仓依赖断点（proxyrules、gen-protocol、workspace:*、复合 action）需要大量额外机制。而 Release 产物分离这个真实痛点，改约 40 行 workflow 即可解决。

## Global Constraints

- 工作目录：`/Users/noelorin/Projects/GOSpeak`；主仓库 `https://github.com/NoelOrin/GOSpeak.git`。
- 分支策略：从最新 `origin/release` 签出短期工作分支；唯一常驻分支为 `release`。
- 不拆仓库、不改目录结构、不改包管理配置。
- 脚本零依赖（对齐 `scripts/` 现有 20 个 .mjs 的风格）；发布类脚本改动必须配同名 `.test.mjs`。
- 代码不加注释（复杂逻辑除外）、不用 emoji；提交遵循 Conventional Commits。
- 文档与代码同 PR。

## Review Focus

- **产物仍混在一起**：验证方式是分别对 server 和 desktop 各跑一次 `workflow_dispatch`，检查两个 Release 条目的附件清单是否各自干净；Task 3 Step 3 钉住。
- **正文渲染错误**：`release-notes.mjs` 的 `--component` 分支必须让 server Release 只含服务端表格、desktop Release 只含安装包表格；Task 2 Step 5 钉住。
- **latest 语义漂移**：desktop Release 不能让 `/releases/latest` 指向它（文档下载卡与桌面端「前往下载页」依赖该语义）；Task 2 Step 6 用 `--latest=false` 钉住。
- **文档站误部署**：`docs.yml` 由 release 事件触发，desktop Release 不应触发文档部署；Task 3 Step 2 钉住。
- **lockstep 删除后版本漂移**：删除约束后 server 与 desktop 可各自独立发版，需确认 `version-bump.yml` 的 tag 存在性判断仍按组件独立工作；Task 1 Step 2 钉住。

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `.github/workflows/release.yml` | `create-release` 按触发组件建 Release；删除 `desktop_included` 注入；3 处上传目标改为自身 tag |
| `.github/workflows/version-bump.yml` | 删除 `Require lockstep component versions` 步骤（第 78-89 行） |
| `.github/workflows/docs.yml` | release 事件加组件前缀判断，只有 server Release 触发文档部署 |
| `scripts/release-naming.mjs` + `.test.mjs` | `COMPONENTS` 扩到四组件 |
| `scripts/release-notes.mjs` + `.test.mjs` | 新增 `--component`，按组件只渲染本组件表格 |
| `app/server/internal/router/router.go` | `serveSPA` 为 `index.html` 补 `Cache-Control: no-store` |
| `app/server/internal/service/system_update_service.go` + `_test.go` | 修 `mainTagPattern` |
| `app/docs/guide/desktop.md` | 下载说明改为指向桌面端 Release |
| `AGENTS.md` / `scripts/AGENTS.md` | 发布模型描述同步 |

---
## Task 1: 删除 lockstep 约束

**Files:**
- Modify: `.github/workflows/version-bump.yml`

**Interfaces:**
- Consumes: 现状（`server.yaml` 与 `desktop.yaml` 强制同版本）。
- Produces: 两端可独立发版；供 Task 2 的按组件 Release 使用。

- [ ] **Step 1: 删除 lockstep 校验步骤**

删除 `.github/workflows/version-bump.yml` 中名为 `Require lockstep component versions` 的整个 step（当前第 78-89 行），连同其 `SERVER_VERSION` / `DESKTOP_VERSION` 环境变量与比对逻辑。

Run:
```bash
grep -n "lockstep" .github/workflows/version-bump.yml
```
Expected: 无输出。

- [ ] **Step 2: 确认按组件独立打 tag 仍然工作**

检查 `Detect published tags` 与后续打 tag 步骤，确认对 server 与 desktop 是各自独立判断 tag 是否存在（现有实现已是如此，第 155-168 行分别 `git tag -a` 并 push）。

Run: `/tmp/actionlint -color .github/workflows/version-bump.yml`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/version-bump.yml
git commit -m "ci: drop lockstep version constraint between server and desktop"
```

---

## Task 2: 一组件一 Release

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/release-notes.mjs` + `.test.mjs`

**Interfaces:**
- Consumes: Task 1 的独立版本。
- Produces: 每个组件在自己的 tag 上创建独立 Release，只含本组件产物。

- [ ] **Step 1: 改 create-release 的 tag 来源**

`release.yml` 第 157 行改为按触发组件取 tag：

```bash
# 改前
release_tag="$(node scripts/release-naming.mjs tag server "$RELEASE_VERSION")"

# 改后
release_tag="${{ needs.resolve-tag.outputs.tag }}"
```

同时把 Release 标题从写死的 `GOSpeak v$RELEASE_VERSION` 改为按组件生成（如 `GOSpeak Server v1.3.0` / `GOSpeak Desktop v1.3.0`）。

- [ ] **Step 2: 删除 desktop_included 注入逻辑**

删除 `release.yml` 第 204-224 行中 `desktop_version` / `desktop_args` / `desktop_included` 的整段逻辑，以及 `--desktop-version` / `--desktop-included` / `--desktop-notes-file` 参数传递。

Expected: `grep -n "desktop_included" .github/workflows/release.yml` 无输出。

- [ ] **Step 3: 改 3 处上传目标**

`release.yml` 第 592 / 759 / 824 行的 `TAG:` 全部改为：

```yaml
TAG: ${{ needs.resolve-tag.outputs.tag }}
```

这样 server 产物传到 server tag、desktop 产物传到 desktop tag。

- [ ] **Step 4: release-notes.mjs 增加 --component**

给 `scripts/release-notes.mjs` 的 `release` 子命令加 `--component <server|desktop>`：
- `server`：只渲染服务端产物表格 + Docker/部署说明
- `desktop`：只渲染安装包表格 + 系统要求说明

复用现有 `renderServerTable` / `renderDesktopTable`，不再拼接两者。

- [ ] **Step 5: 写测试**

在 `scripts/release-notes.test.mjs` 增加：
- `--component server` 的输出不含 `.dmg` / `.deb` / `install.sh`
- `--component desktop` 的输出不含 `gospeak-server-` 二进制条目

Run: `node --test scripts/release-notes.test.mjs`
Expected: PASS。

- [ ] **Step 6: latest 语义保护**

`gh release create` 时：desktop 传 `--latest=false`，server 传 `--latest`。保证 `/releases/latest` 始终指向服务端版本（文档下载卡与桌面端「前往下载页」依赖它）。

Expected: `grep -n "latest" .github/workflows/release.yml` 能看到明确的 `--latest` / `--latest=false` 分支。

- [ ] **Step 7: 提交**

```bash
git add .github/workflows/release.yml scripts/release-notes.mjs scripts/release-notes.test.mjs
git commit -m "ci: create one release per component with isolated artifacts"
```

---
## Task 3: 扩展组件解析并验证产物分离

**Files:**
- Modify: `scripts/release-naming.mjs` + `.test.mjs`
- Modify: `.github/workflows/docs.yml`

**Interfaces:**
- Consumes: Task 2 的按组件 Release。
- Produces: 组件名解析完整；文档站不被桌面 Release 误触发。

- [ ] **Step 1: 扩展 COMPONENTS**

`scripts/release-naming.mjs` 第 22 行 `COMPONENTS = ["server", "desktop"]` 扩为 `["server", "web", "desktop", "mobile"]`，并补对应 `releaseTag` / `parseReleaseTag` 测试。

Run: `node --test scripts/release-naming.test.mjs`
Expected: PASS。

- [ ] **Step 2: docs.yml 加组件判断**

`.github/workflows/docs.yml` 的 release 触发步骤加：

```yaml
if: startsWith(github.event.release.tag_name, 'gospeak-server-v')
```

避免桌面 Release 触发文档部署。

Expected: `grep -n "gospeak-server-v" .github/workflows/docs.yml` 有命中。

- [ ] **Step 3: 实跑验证**

分别对 server 与 desktop 各触发一次：

```bash
gh workflow run release.yml -f tag=gospeak-server-v<当前版本>
gh workflow run release.yml -f tag=gospeak-desktop-v<当前版本>
```

然后检查：

```bash
gh release view gospeak-server-v<版本> --json assets -q '.assets[].name'
gh release view gospeak-desktop-v<版本> --json assets -q '.assets[].name'
```

Expected: server Release 只有 `gospeak-server-*` 二进制与 `SHA256SUMS-gospeak-server-*`；desktop Release 只有 `.dmg` / `.deb` / `.exe` / `install.sh` 与 `SHA256SUMS-gospeak-desktop-*`。

- [ ] **Step 4: 提交**

```bash
git add scripts/release-naming.mjs scripts/release-naming.test.mjs .github/workflows/docs.yml
git commit -m "ci: extend release components and guard docs deploy"
```

---

## Task 4: 修复两个现存 bug

**Files:**
- Modify: `app/server/internal/service/system_update_service.go` + `_test.go`
- Modify: `app/server/internal/router/router.go`

**Interfaces:**
- Consumes: 无（与 Task 1-3 独立）。
- Produces: 更新检测恢复工作；前端首页不被缓存。

- [ ] **Step 1: 修 mainTagPattern**

`system_update_service.go` 第 31 行：

```go
// 改前：匹配不到任何现网 tag（仓库里 0 个 v* tag，11 个 gospeak-server-v*）
var mainTagPattern = regexp.MustCompile(`^v[0-9]`)

// 改后
var mainTagPattern = regexp.MustCompile(`^gospeak-server-v[0-9]`)
```

同时把 `fetchLatest` 里 `strings.TrimPrefix(r.TagName, "v")` 改为 `strings.TrimPrefix(r.TagName, "gospeak-server-v")`（第 117 / 173 行附近）。

- [ ] **Step 2: 写测试**

在 `system_update_service_test.go` 增加：`gospeak-server-v1.3.0` 能被识别、`gospeak-desktop-v1.3.0` 被忽略。

Run: `cd app/server && go test ./internal/service/ -run TestSystemUpdate`
Expected: PASS。

- [ ] **Step 3: serveSPA 补 no-store**

`router.go` 的 `serveSPA` 中，两个 `serveIndex` 实现（外部目录分支与 embed 分支）在返回前各加一行：

```go
c.Header("Cache-Control", "no-store")
```

只针对 `index.html`；带 hash 的静态资源保持长缓存。

- [ ] **Step 4: 提交**

```bash
git add app/server/internal/service/system_update_service.go app/server/internal/service/system_update_service_test.go app/server/internal/router/router.go
git commit -m "fix: update check tag pattern and index.html cache header"
```

---

## Task 5: 文档同步

**Files:**
- Modify: `app/docs/guide/desktop.md`
- Modify: `AGENTS.md` / `scripts/AGENTS.md`

- [ ] **Step 1: 更新桌面端下载说明**

`app/docs/guide/desktop.md` 第 17-18 行的下载链接改为指向 `gospeak-desktop-v*` 的 Release 条目，而不是 server Release。

- [ ] **Step 2: 更新 AGENTS.md 发布模型**

关于「一版一个 Release」的描述改为「一组件一 Release，各自独立」。

Run: `grep -rn "一版一个 Release\|统一 Release" AGENTS.md scripts/AGENTS.md app/docs/`
Expected: 无残留旧描述。

- [ ] **Step 3: 提交**

```bash
git add app/docs/guide/desktop.md AGENTS.md scripts/AGENTS.md
git commit -m "docs: reflect per-component release model"
```

---

## Task 6: 回滚预案

**Files:** 无（操作任务）

- [ ] **Step 1: 撤销 workflow 改动**

```bash
git revert <Task 1-3 commit sha>
```
Expected: 回到「一版一个 Release」的旧行为；已存在的 Release 条目不受影响。

- [ ] **Step 2: 清理多余 Release（可选）**

若需回到单一 Release，手工把 desktop Release 的附件移到 server Release 后删除前者：

```bash
gh release download gospeak-desktop-v<版本> -D /tmp/desktop-assets
gh release upload gospeak-server-v<版本> /tmp/desktop-assets/* --clobber
gh release delete gospeak-desktop-v<版本> --yes
```
