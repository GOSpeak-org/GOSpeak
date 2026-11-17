# GOSpeak Monorepo — Agent 开发指南

> 本文件是 agent 与人类开发者的统一入口。
>
> **核心原则：易变的事实只留在代码里。** 本文件只写**约束**与**指针**；需要精确清单（路由、模型字段、环境变量、事件名）时，去「单一事实源索引」指出的文件读取，不要依赖本文件的转述。
>
> 上一次全量对齐：2026-11-16（dev-1116）。

---

## 1. 项目速览

GOSpeak 是自托管的游戏语音平台（类似可私有部署的 Discord 语音房间）。WebRTC 实时音视频，SFU 基于 LiveKit。

**技术栈**

| 层 | 技术 |
|----|------|
| 后端 | Go 1.26 · Gin · GORM · cobra CLI |
| 前端 | React 19 · TypeScript · @tanstack/react-router + react-query · zustand · Tailwind CSS 4 · rolldown-vite 7 |
| UI | workspace 包 `packages/components`（Radix + 自有主题 token，shadcn 风格）· lucide-react · sonner · react-hook-form + zod |
| 信令 | 原生 WebSocket（`internal/ws` + `internal/signal`，路径 `/ws`） |
| SFU | LiveKit（**唯一**支持的后端） |
| 数据库 | SQLite（默认）/ PostgreSQL / MySQL / Turso |
| 事件总线 | 内嵌 NATS + JetStream KV（进程内，无外部 NATS） |
| 存储 | local / S3 兼容（RustFS、R2） |
| 认证 | JWT（access + refresh，HttpOnly Cookie）+ OAuth2（GitHub/Google/QQ） |
| 桌面端 | Go · MyGo · 系统 WebView（`app/desktop` 宿主 + `packages/desktop` 能力 SDK） |
| 工具链 | pnpm 10 · Turbo · Biome · Vitest 4 · Lefthook · commitlint |

**目录骨架**

```
app/
├── server/          Go 后端（入口 main.go → cmd/root.go → server/gin.go 依赖注入）
├── web/             React 前端（@gospeak/web）
├── desktop/         Go + MyGo 桌面宿主
├── mobile/          Capacitor 原生壳（加载 web 的 mobile 目标产物）
└── docs/            VitePress 文档站
packages/
├── components/      通用 UI 组件库（Radix + 主题 token）
├── sfu-client/      前端 SFU 客户端抽象
├── desktop/         桌面能力 SDK（含条件编译与 Web 降级）
└── mobile-capabilities/ 移动能力 SDK（Capacitor 插件 + Web 降级）
test/                API 集成测试（Vitest，自动拉起临时 server）
deploy/              docker-compose / Caddyfile / LiveKit 配置
docs/                设计、运维与评审档案
scripts/             发布、版本、UI token 等门禁脚本
agent_test_logs/     agent 测试记录（规范见 agent_test_logs/AGENTS.md）
```

### 1.1 当前**不支持**的能力（防止臆造）

以下能力在历史上存在或曾被规划，**当前代码中不存在**，不要为其编写代码或文档：

- **多 SFU provider / 运行时热切换**：`SFU_PROVIDER` 只接受 `livekit`，其他值启动即失败。`sfu.Provider` 抽象层与能力协商仍存在（为未来保留），但不存在可直接启用的第二后端。
- **访客（Guest）访问体系**：已整体删除。`users.is_guest` 列与 `domain_guest_bans` 表均已通过迁移删除；无 `GuestHandler` / `GuestGuard`。
- **集群 / 多实例控制面**：已拆除，当前为单实例架构。不要引用 cluster / agent / worker 控制面。
- **mediasoup / SRS / Agora / Cloudflare provider**：相关实现与配置已移除。
- **Redis**：不作为依赖存在；共享状态走内嵌 NATS KV。
- **SolidJS**：已全量迁移到 React 19，不得新增 Solid 代码或引用 `_solid-legacy`。

---

## 2. 单一事实源索引

**这是本文件最重要的一节。** 想了解下表左列的内容，直接读右列文件；表中内容不在此复述，以免腐化。

| 想知道什么 | 单一事实源 |
|------------|------------|
| 全部 HTTP 路由、分组、中间件 | `app/server/internal/router/routes/*/routes.go`，装配见 `internal/router/router.go` |
| 数据模型与字段 | `app/server/internal/model/*.go`（`AutoMigrate` 在 `internal/repository/db_migrations.go`） |
| 全部环境变量与默认值 | `app/server/internal/config/config.go`；样例 `deploy/.env.example`。加载优先级：`GOSPEAK_ENV_FILE` > `.env.<env>`/`.env` > 仓库根 `deploy/.env` |
| 错误码与 HTTP 映射 | `app/server/internal/pkg/errors.go`、`pkg/response.go` |
| WS 事件名与 payload | `app/server/internal/protocol/events.go`、`payloads.go`、`message_payloads.go` |
| WS 事件前端类型 | `app/web/src/protocol/generated/*.ts`（生成物，勿手改） |
| 权限码 | `app/server/internal/permcode/*.go`；默认角色授权 `internal/model/permission.go` |
| SFU 能力契约 | `app/server/internal/sfu/provider.go`、`types.go`、`capabilities.go` |
| 前端目录与页面 | `app/web/src/`（页面 `src/pages/`，路由树生成物 `routeTree.gen.ts`） |
| 前端技术约定细节 | `app/web/docs/AGENTS.md` |
| 设计 token（圆角/字号/图标尺寸） | `packages/components/src/theme.css` |
| 桌面桥接命令 | Go 侧 `mygo.Bind(...)` 声明（`app/desktop/*.go`）+ TS 侧 `packages/desktop/src/bridge.ts`；一致性由 `scripts/check-desktop-commands.mjs` 校验 |
| 三端共享反代纯规则（地址校验 / `Set-Cookie` 改写 / worker 白名单） | `app/shared/proxyrules/`（纯 Go，桌面直接 import，移动端经 gomobile bind） |
| 部署方式 | `deploy/DEPLOY.md`、`docs/deployment-guide.md` |
| 每个模块的开发约定 | 各目录下的 `AGENTS.md`（见第 7 节） |

---

## 3. 架构与分层

```
Request → Router → Middleware(JWTAuth / RBAC / BanCheck) → Handler → Service → Repository → DB
                                                              ↓           ↓
                                                             SFU       AuthState
                                                              ↓
                                                          Signal / WS
```

**分层硬约束**

1. **只与正下层通信**：Handler 只调 Service；Service 只调 Repository 与外部抽象（SFU / AuthState / Bus）；Repository 只碰数据库。
2. **Service 不感知 HTTP**：`internal/service/` 禁止 import `gin`、禁止读写 `*gin.Context`。
3. **Handler 不写业务**：只做参数绑定、调用 Service、组装响应，不写领域规则。
4. **Repository 不做策略**：不把角色升降级、权限计算等业务规则固化进 SQL；复用 `internal/policy` 与 `model` 的策略。
5. **依赖注入在 `server/gin.go`**：新增 Service/Repository 必须在此装配，不在包级单例里偷偷初始化。
6. **策略单点**：封禁等判决走 `internal/policy`，HTTP 与 WS 两个通道共用同一 Engine，不得各写一份。

---

## 4. 开发范式约束

### 4.1 分层与错误处理

- **Service 返回 `*pkg.AppError`**。历史代码存在少量 `fmt.Errorf` 例外，**新增代码一律用 `pkg.NewAppError`**，不要扩散例外。
- **Handler 用 `pkg.HandleError(c, err)`** 统一映射；参数校验失败直接 `pkg.Fail(c, pkg.INVALID_PARAMS, ...)`。
- **成功响应一律 `pkg.Success(c, data)`**，外壳固定 `{code, msg, data}`；错误时 `data` 为 `null`。
- **错误码按区间选，不要自造数字**：`1xxx` 认证 / `2xxx` 参数 / `3xxx` 资源 / `5xxx` 系统 / `6xxx` SFU / `7xxx` OAuth / `8xxx` 邮件 / `81xx` 存储。具体码查 `pkg/errors.go`。
- **敏感信息脱敏**：错误详情由 `pkg/response.go` 的脱敏策略控制，不要把内部错误原文直接透给客户端。
- **Go 约定**：文件名 `snake_case`，类型 `PascalCase`；import 分标准库 / 第三方 / 内部三组，空行分隔；Handler 方法接 `*gin.Context` 且无返回值；Service 方法返回 `(result, error)`。
- **注释与符号**：代码内除复杂逻辑外不加注释；代码中不用 emoji（文档可以）。

### 4.2 协议单一事实源

WS 事件协议只有一个定义处：`app/server/internal/protocol`。

- **禁止在任何其他包或前端手写 wire 事件名字符串**。用 `protocol.EventXxx` 常量，或前端 `socket/events.ts` 的重导出。
- **改协议的四步**：改 `internal/protocol` → 跑 `pnpm gen:protocol` → 提交 `app/web/src/protocol/generated/` 变更 → 更新使用方。
- **三道防漂移**：`protocol/gen_contract_test.go`（生成物新鲜度）、lefthook pre-push 的 gen-diff、CI 的 protocol 校验。忘记重新生成会在推送前被拦下。
- **`DirInternal` 事件不产出前端 TS**，只用于服务端内部投递。
- 新增事件必须同步在 `events.go` 的 Catalog 与 `payloadStructs` / `eventConsts` 登记，否则契约测试失败。

### 4.3 UI / 设计 token

- **圆角、字号、文字层级、图标尺寸一律走 `packages/components/src/theme.css` 的 token**，业务代码只允许用工具类（`rounded-lg` 等）。
- **禁止任意值**：`rounded-[4px]`、`rounded-[var(--radius)]`、CSS 里写 `border-radius: 4px` 都会被 `pnpm lint:radius` 拦下。
- **图标统一 `lucide-react` 按需导入**；品牌图标用 `components/oauth/ProviderIcon.tsx`（lucide 无品牌图标）。
- **组件来源**：通用 UI 放 `packages/components`，业务组件放 `app/web/src/components`；不要在页面里堆一次性组件。
- **状态管理**：服务端状态用 react-query；客户端状态用 zustand，采用「`xxxStore` 命令式门面 + `useXxxStore` hook」双入口，组件用 selector 订阅。
- **Hooks 依赖**：`useExhaustiveDependencies` 是 warn 级别，但 `scripts/check-hook-deps.mjs` 是棘轮门禁——**只许减少、不许新增告警**；豁免用 `biome-ignore` 并写明理由。
- 格式由 Biome 统一（tab 缩进、LF）；提交前 pre-commit 会自动 `biome check --write`。

### 4.4 桌面条件编译边界

同一个前端代码库产出 Web、桌面与移动三个目标，靠编译期常量裁剪。

- **目标由 `GOSPEAK_TARGET`（`web` | `desktop` | `mobile`）决定**，Vite 在 `app/web/vite.config.ts` 注入 `__GOSPEAK_TARGET__` / `__GOSPEAK_DESKTOP__` / `__GOSPEAK_MOBILE__`，`@gospeak/desktop` 与 `@gospeak/mobile-capabilities` 各自定义布告常量。
- **判定用 `inDesktop()`**（来自 `@gospeak/desktop`）：**禁止在业务代码新增裸 `isDesktop()` 调用点**。`isDesktop()` 仅限 SDK 内部 `capabilities/*` 的浏览器降级实现使用。
- **桌面独享模块**在 Web 构建中被摇树剔除；因此改 `app/desktop/` 或 `packages/desktop/` 后必须跑一次桌面构建验证，`tsc --noEmit` 会完整检查死分支。
- **桥接命令契约**：MyGo 以 `"<Struct>.<Method>"` 绑定方法，TS SDK 必须逐字一致；`scripts/check-desktop-commands.mjs` 在 CI 与 pre-push 拦截拼写漂移。
- **桌面能力必须有 Web 降级**：新增能力在 `packages/desktop/src/capabilities/` 里同时提供 native 与 fallback。
- 构建命令：`pnpm --filter @gospeak/web build:desktop` / `dev:desktop`；移动目标为 `build:mobile` / `dev:mobile`，由 `app/mobile`（Capacitor）装载，平台判定用 `inMobile()`（`@gospeak/mobile-capabilities`）。

### 4.5 Git / 文档卫生

- **Conventional Commits**（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:` …），由 commitlint + lefthook 强制。
- **分支**：`release`（生产，默认分支）/ `dev`（开发）/ `feature/*`。PR 前确认 lint、typecheck、build 通过。
- **从 `release` 签出分支再合入**：改动一律从最新的 `origin/release` 签出新分支（`git fetch origin && git switch -c <branch> origin/release`），不要基于已分叉的本地旧分支直接开 PR；合入目标默认 `release`。历史分支与 `release` 分叉时，应把工作区改动变基到最新 `release` 之上，而不是带着分叉历史合并。
- **文档单一事实源**：同一事实只在一处陈述。**不要把易变清单（路由表、模型字段、env 全表、事件全表）复制进指南**——这正是历史上文档腐化的原因。
- **文档与代码同 PR 更新**：改路由/模型/env/事件时，同步更新对应的 `AGENTS.md` 指针或说明。
- **不留过期文档**：能力被删除或设计被取代时，连同文档一起删除（历史留在 git log），不要让“已废弃”的文档继续留在树里。
- **计划索引**：`docs/superpowers/plans/README.md` 只列仍在跟进的计划；已交付或失效的实现记录应删除。
- **agent 测试记录**写入 `agent_test_logs/`，命名 `{内容}-{时间}.md`，规范见 `agent_test_logs/AGENTS.md`。

---

## 5. 变更流程

### 5.1 新增后端功能

1. `internal/model/` 定义实体（并在迁移注册）。
2. `internal/repository/` 加数据访问。
3. `internal/service/` 写业务，返回 `*AppError`。
4. `internal/handler/` 加 HTTP 入口。
5. `internal/router/routes/<module>/routes.go` 注册路由，并在 `internal/router/router.go` 挂到正确的组（public / protected）。
6. `server/gin.go` 装配依赖。
7. 补测试：Go 单测放在同包 `*_test.go`；API 集成测试放 `test/<module>/`。
8. 需要对外暴露时更新 Swagger（`app/server/docs/`）。

### 5.2 新增 WS 事件

见 §4.2。事件常量 → payload 登记 → `pnpm gen:protocol` → 前端消费 → 契约测试。

### 5.3 新增 SFU 后端（当前不建议）

前置条件缺一不可：`internal/sfu` 能力表登记 → `factory/` 注册构造器 → `config/config_validate.go` 放开 `SFU_PROVIDER` 白名单 → `service/sfu_config_service.go` 的约束同步放开。**在此之前不要新增第二后端**，也不要恢复“多 provider 动态切换”的文档叙事。

---

## 6. 验证与门禁

```bash
pnpm dev            # 并行起后端(:8998) + 前端(:3000)
pnpm typecheck      # tsc --noEmit，按包并行
pnpm lint           # biome check + go vet
pnpm test           # 全部单测（web / sfu-client / components / 集成）
pnpm test:server:go # Go 单测
pnpm test:server    # API 集成测试（自动拉起临时 server）
pnpm build          # turbo 全量构建
pnpm gen:protocol   # 重新生成前端协议类型
```

**本地钩子（lefthook）**

- pre-commit：`biome check --write`（staged 文件）、`go vet`。
- pre-push：`biome ci`、hook 依赖棘轮、`go vet`、protocol gen-diff、圆角 token、桌面桥接契约、`typecheck`。

**CI（`.github/workflows/ci.yml`）**：changes 检测 → lint → typecheck → build-js → build-server → test-server / test-web / test-packages / test-scripts → desktop-go，由聚合 gate 汇总。

---

## 7. 模块级指北

| 位置 | 内容 |
|------|------|
| `app/server/AGENTS.md` | 服务端入口、目录、启动与配置加载 |
| `app/server/internal/{handler,service,repository,model,middleware,router}/AGENTS.md` | 分层职责与约定 |
| `app/server/internal/{pkg,logger,config,buildinfo,permcode,policy}/AGENTS.md` | 公共能力、配置、版本、权限码、策略 |
| `app/server/internal/{protocol,genprotocol,ws,signal}/AGENTS.md` | 事件协议单一事实源、生成器、WS 基础设施、信令 Hub |
| `app/server/internal/{bus,authstate,jobs,notify,metrics,audit}/AGENTS.md` | 事件总线、认证状态、后台任务、通知、指标、审计 |
| `app/server/internal/{sfu,sfu/factory,sfu/providers,sfu/providers/livekit}/AGENTS.md` | SFU 抽象、工厂与解析、provider 实现 |
| `app/server/internal/{storage,livekitproxy,webui}/AGENTS.md` | 对象存储、LiveKit 同源反代、内嵌前端 |
| `app/web/AGENTS.md` | 前端包：命令、构建期常量、路由生成、代理、产物 |
| `app/web/src/AGENTS.md` | 源码目录职责、约定与易错点 |
| `app/web/docs/AGENTS.md` / `app/web/scripts/AGENTS.md` | 前端技术栈与约定、构建辅助脚本 |
| `app/desktop/AGENTS.md` | 桌面宿主：启动链、回环反代、自愈、桥接、构建 |
| `app/docs/AGENTS.md` | VitePress 文档站结构与维护约定 |
| `packages/{components,sfu-client,desktop}/AGENTS.md` | 组件库、媒体会话客户端、桌面能力 SDK |
| `test/AGENTS.md` | API 集成测试套件与约定 |
| `deploy/AGENTS.md` | 部署档位、配置单一来源与一致性校验 |
| `scripts/AGENTS.md` | 工程门禁与发布脚本 |
| `agent_test_logs/AGENTS.md` | 测试记录规范 |
| `app/mobile/AGENTS.md` / `packages/mobile-capabilities/AGENTS.md` | 移动壳、移动能力 SDK |

---

## 8. 关键参考

- 架构图：`ARCHITECTURE.md`
- 速查（命令/规范摘要）：`CLAUDE.md`
- 部署：`deploy/DEPLOY.md`、`docs/deployment-guide.md`
- 权限模型：`docs/permissions.md`
- SFU 成熟度：`docs/sfu-provider-maturity.md`
- E2E 规范：`docs/e2e-test-spec.md`
