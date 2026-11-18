# Casbin 权威化 + 域策略失效 + 角色权限页域作用域 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉每次鉴权的全量 Casbin 策略重载、让 Casbin 成为唯一鉴权权威，并在角色权限页加入域作用域切换。

**Architecture:** 后端构造器强制注入 Casbin adapter（seed 提前到构造前），策略变更走事件驱动失效；前端把 `DomainRolePanel` 提为共享组件，在 `/manage/roles` 加作用域切换。

**Tech Stack:** Go 1.26 / casbin v2.135 / Gin / GORM / 内嵌 NATS；React 19 / TanStack Router+Query / zustand。

**Spec:** docs/superpowers/specs/2026-11-18-casbin-authoritative-and-domain-perm-ui-design.md

## Global Constraints

- 分支 dev-1118，工作区已有**大量无关未提交改动**：不要 commit、stash、rebase、checkout。
- 不修改 `internal/policy` 的封禁判决；不碰多 SFU/访客/集群；保留 `memberCache`。
- 协议改动走四步：改 `internal/protocol` → `pnpm gen:protocol` → 提交生成物变更（本次内部事件预期无 TS diff）→ 更新使用方。
- 代码不加无关注释、不用 emoji；Go 文件 `snake_case`，Service 返回 `*pkg.AppError`。
- 前端通用组件放 `app/web/src/components/manage`，样式只用 token 类名。

---

### Task 1: 新增 EventDomainPolicyChanged 内部事件

**Files:**
- Modify: app/server/internal/protocol/events.go（Catalog + payloadStructs/eventConsts）
- Modify: app/server/internal/protocol/payloads.go（注意：工作区已有 CreatedBy 字段改动，必须保留）
- Test: app/server/internal/protocol/gen_contract_test.go（生成物新鲜度，已存在）

- [ ] **Step 1: 在 payloads.go 加 payload 结构（保留已有 CreatedBy）**

```go
type DomainPolicyChangedPayload struct {
	DomainUUID string `json:"domain_uuid,omitempty"`
}
```

- [ ] **Step 2: 在 events.go 登记常量、Catalog、payloadStructs、eventConsts**

参照 `EventDomainMembershipChanged` 的三处写法，新增 `EventDomainPolicyChanged`，`Dir: DirInternal`，`Payload: "DomainPolicyChangedPayload"`。

- [ ] **Step 3: 生成契约并确认无前端 TS 改动**

Run: `pnpm gen:protocol`，然后 `git diff --stat app/web/src/protocol/generated/`（与改前基线比对，注意已有 payloads.ts 改动）。
Expected: 生成物新鲜度测试通过；无新的 TS 文件改动。

- [ ] **Step 4: 跑协议契约测试**

Run: `cd app/server && go test ./internal/protocol/... -run TestGenerated`
Expected: PASS

---

### Task 2: DomainService/Casbin 权威化 + 事件驱动失效

**Files:**
- Modify: app/server/internal/service/domain_service.go
- Modify: app/server/internal/service/domain_casbin.go
- Test: app/server/internal/service/domain_casbin_test.go
- Test: app/server/internal/service/domain_service_test.go

**Interfaces:**
- Produces: `NewDomainService(domainRepo, roleRepo, inviteCreator, adapter) (*DomainService, error)`；`(*DomainService).ReloadPolicy() error`；内部 `policyStale bool`。

- [ ] **Step 1: 写失败测试——写操作后策略即时生效且无每判 reload**

在 `domain_casbin_test.go` 新增：构造带 GORM adapter 的 svc，调 `AddMember` 后立即 `HasDomainPermission` 应为 true；用一个 counting adapter 记录 `LoadPolicy` 调用次数，连续 10 次 `HasDomainPermission` 不应增加调用次数。

- [ ] **Step 2: 运行确认失败**

Run: `cd app/server && go test ./internal/service/... -run 'TestDomain.*Reload|TestHasDomainPermission' -count=1`
Expected: FAIL（当前实现每次判定都 LoadPolicy）

- [ ] **Step 3: 改 domain_casbin.go——把 UseCasbin 逻辑抽成 newDomainEnforcer(adapter)**

```go
func newDomainEnforcer(adapter casbinpersist.Adapter) (*casbin.SyncedEnforcer, error) {
	m, err := casbinmodel.NewModelFromString(domainCasbinModelText())
	if err != nil { return nil, fmt.Errorf("load domain casbin model: %w", err) }
	e, err := casbin.NewSyncedEnforcer(m, adapter)
	if err != nil { return nil, fmt.Errorf("init domain casbin enforcer: %w", err) }
	if err := e.LoadPolicy(); err != nil { return nil, fmt.Errorf("load domain casbin policy: %w", err) }
	return e, nil
}
```
删除 `UseCasbin` 与 `reloadDomainCasbin`。

- [ ] **Step 4: 改 domain_service.go——构造签名、字段、HasDomainPermission、ReloadPolicy**

- 字段：删 `useCasbin`，加 `authEnforcer *casbin.SyncedEnforcer`、`policyStale bool`。
- `NewDomainService(domainRepo, roleRepo, inviteCreator, adapter casbinpersist.Adapter) (*DomainService, error)`：内部调 `newDomainEnforcer(adapter)`，失败返回 `pkg.NewAppError(pkg.INTERNAL_ERROR, err.Error())`。
- `HasDomainPermission`：`policyStale` 时直接 false；否则 `enforcer.Enforce(userUUID, domainUUID, permCode)`，err 或 !allowed 均 false。删除 DB 回落分支与 `reloadDomainCasbin` 调用。
- `ReloadPolicy() error`：`enforcer.LoadPolicy()`，成功置 `policyStale=false`，失败置 true 并 `log.Printf`，返回 err。
- `notifyPolicyChanged(domainUUID string)`：先 `ReloadPolicy()`，再 `bus.PublishInternal(ctx, EventDomainPolicyChanged, DomainPolicyChangedPayload{DomainUUID: domainUUID})`（bus 为 nil 时只本地 reload）。
- `OnRemoteInvalidate`：识别新 payload（map 中 `domain_uuid`）时调 `ReloadPolicy()`。

- [ ] **Step 5: 在所有改策略的写操作成功后调用 notifyPolicyChanged**

逐条：`Create`(domain.UUID)、`AddMember`、`Kick`、`Leave`、`TransferOwnership`(domain.UUID)、`CreateDomainRole`、`UpdateDomainRolePermissions`、`DeleteDomainRole`、`SetMemberRole`。注意 `Create` 里 domain.UUID 在 `CreateWithOwner` 之后才有值。

- [ ] **Step 6: 跑测试通过**

Run: `cd app/server && go test ./internal/service/... -run 'TestDomain' -count=1`
Expected: PASS（迁移构造点的测试在 Task 4 统一改）

---

### Task 3: PermissionService 权威化

**Files:**
- Modify: app/server/internal/service/permission_service.go
- Test: app/server/internal/service/permission_service_test.go（新增或已有）

**Interfaces:**
- Produces: `NewPermissionService(permRepo, adapter) (*PermissionService, error)`

- [ ] **Step 1: 写失败测试——Enforce 失败 fail-closed + remote invalidate 触发 reload**

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 改造实现**

- 构造器接收 adapter，内部建 enforcer（参照 `casbinModelText()` + `NewSyncedEnforcer` + `LoadPolicy`），失败返回 error；删除 `useCasbin`。
- `HasPermission`：只走 `enforcer.Enforce(roleName, permCode)`，err 时记日志并返回 false，删除 cache 回落。
- `OnRemoteInvalidate`：`LoadCache()` 后追加 `reloadCasbin()`。
- 删除 `UseCasbin` 方法。`cache` / `GetRolePermissions` / `LoadCache` 保留供读接口。
- `SyncRolePermissions` / `RenameRole` 保持现有 reload 逻辑。

- [ ] **Step 4: 跑测试通过**

---

### Task 4: 启动顺序改造与所有构造点迁移

**Files:**
- Modify: app/server/server/bootstrap.go
- Modify: app/server/server/gin.go
- Modify: 所有调用 `NewDomainService` / `NewPermissionService` 的测试文件（14 + 6 处）
- Test: app/server/...（全量）

- [ ] **Step 1: 拆分 bootstrap**

`bootstrap.go` 中 `bootstrapControlPlane` 改名为 `seedControlPlane`，签名去掉 `permSvc`，删除 `permSvc.UseCasbin(...)` 调用；其余 seed 步骤不变。

- [ ] **Step 2: 改 gin.go 装配顺序**

- `sfuConfigSvc` 构造提前到 repository 之后。
- 在构造 `permSvc` / `domainSvc` **之前**调用 `seedControlPlane(db, roleRepo, userRepo, permRepo, sfuConfigSvc)`。
- `permSvc, err := service.NewPermissionService(permRepo, repository.NewCasbinAdapter(db))`；`domainSvc, err := service.NewDomainService(domainRepo, domainRoleRepo, inviteSvc, repository.NewDomainCasbinAdapter(db))`；错误直接 return。
- 删除原 gin.go:331 的 `bootstrapControlPlane(...)` 调用。
- dispatcher 注册 `service.EventDomainPolicyChanged` → `func(interface{}) { _ = domainSvc.ReloadPolicy() }`。

- [ ] **Step 3: 迁移所有测试构造点**

每个 `NewDomainService(...)` 传 `repository.NewDomainCasbinAdapter(db)` 并接第二个返回值；每个 `NewPermissionService(...)` 传 `repository.NewCasbinAdapter(db)` 并接第二个返回值。测试中需要 seed 权限的，用 `repository.SeedDefaultRoles`/已有 helper 保证 DB 有数据后再构造。
（涉及：routes/room、routes/message、service/domain_service_test、service/domain_casbin_test、handler/domain_handler_test、handler/room_handler_*.test 等，按 grep 结果逐处改。）

- [ ] **Step 4: 全量 Go 测试**

Run: `cd app/server && go test ./... -count=1`
Expected: PASS

---

### Task 5: 角色权限页域作用域（前端）

**Files:**
- Move: app/web/src/pages/(app)/manage/domains/$domainUUID/components/DomainRolePanel.tsx → app/web/src/components/manage/DomainRolePanel.tsx
- Modify: app/web/src/pages/(app)/manage/domains/$domainUUID/index.tsx（import）
- Modify: app/web/src/pages/(app)/manage/roles/index.tsx
- Test: app/web/src/pages/(app)/manage/roles/index.test.tsx（新增）

- [ ] **Step 1: 移动共享组件并更新引用**

用 `git mv` 移动 `DomainRolePanel.tsx` 到 `components/manage/`，域详情页改 import 路径。

- [ ] **Step 2: 角色权限页加作用域选择器**

- `useQuery` 拉 `myDomains`（复用 `api/domain` 的 `listMyDomains`），下拉选项：`平台` + 各域名称。
- state `scope`（`""` = 平台，否则 domainUUID）。
- 平台视图保持现有 `ManageSection` + 角色列表 + 权限勾选 + `syncRolePermissions`。
- 域视图：`useQuery` 拉 `listDomainRoles(scope)`（返回 `{roles, assignable}`），渲染 `DomainRolePanel`，`onCreate/onUpdate/onDelete` 分别调 `createDomainRole` / `updateDomainRolePermissions` / `deleteDomainRole`，成功后 `invalidateQueries`。
- 编辑权限：`const canEdit = scope ? hasDomainPermission(scope, "domain:role:manage") || hasPermission("domain:manage") : hasPermission("role:manage")`；只读时禁用所有操作按钮。
- 平台视图里 `domain:*` 权限项加分组标签“平台级（作用于所有域）”，与域视图的域/房间/消息分组区分。

- [ ] **Step 3: 写交互测试**

测试：切到域作用域后展示该域角色列表；无 `domain:role:manage` 时操作按钮禁用；创建角色调用正确 API。

- [ ] **Step 4: 前端验证**

Run: `pnpm --filter @gospeak/web typecheck && pnpm --filter @gospeak/web test`
Expected: PASS

---

### Task 6: 全量验证与文档

- [ ] **Step 1: 跑完整门禁**

```bash
cd app/server && go test ./... -count=1 && cd ../.. && pnpm gen:protocol && pnpm test:server && pnpm --filter @gospeak/web typecheck && pnpm --filter @gospeak/web test && pnpm lint
```

- [ ] **Step 2: 更新 docs/permissions.md 的相关描述**

在权限文档补一句：域内角色权限在角色权限页的“域作用域”下配置；平台 `domain:*` 权限码是跨域开关。

- [ ] **Step 3: 记录测试日志到 agent_test_logs/**

按 `agent_test_logs/AGENTS.md` 命名规范写一份本次改造的测试记录。
