# CLAUDE.md — GOSpeak 开发者指南

GOSpeak 是基于 WebRTC 的实时音视频沟通平台。pnpm monorepo：Go 后端 + React 19 前端，SFU 抽象层基于 LiveKit。

详细架构见 `AGENTS.md` 与 `ARCHITECTURE.md`。本文件是日常开发的速查版。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Go 1.26 · Gin · GORM · cobra CLI |
| 前端 | React 19 · TypeScript · @tanstack/react-router/query · zustand · Tailwind 4 · packages/components · rolldown-vite 7 · lucide-react · sonner · react-hook-form + zod |
| 信令 | 原生 WebSocket (internal/ws，/ws) |
| SFU | LiveKit（唯一后端；`sfu.Provider` 抽象保留） |
| DB | SQLite(默认) / PostgreSQL / MySQL — GORM 自动迁移 |
| 事件总线 | 内嵌 NATS KV — JWT 轮换 + Token 黑名单（固定 embedded）|
| 存储 | local / S3(RustFS/R2) |
| 认证 | JWT + OAuth2(GitHub/Google/QQ) |
| 桌面端 | Go 1.27 · MyGo 0.8 · 系统 WebView（`app/desktop` 宿主 + `packages/desktop` 能力 SDK）|
| 工具链 | pnpm 10 · Turbo · Biome(lint/format) · Vitest 4 + @testing-library/react · Lefthook · commitlint |

---

## 目录结构

```
app/
├── server/          # Go 后端
│   ├── main.go              # 入口 (cobra)
│   ├── cmd/root.go          # server -e dev|prod, version
│   ├── server/gin.go        # DI 容器，组装全部分层
│   ├── internal/
│   │   ├── config/          # 环境变量读取
│   │   ├── model/           # GORM 实体
│   │   ├── repository/      # 数据访问层
│   │   ├── service/         # 业务逻辑层
│   │   ├── handler/         # HTTP 控制器 (Gin)
│   │   ├── middleware/      # JWTAuth, BanCheck, RequireRole/Permission, CORS
│   │   ├── router/routes/  # 按模块分组路由
│   │   ├── sfu/             # SFU Provider 抽象 + 工厂 + DynamicProvider
│   │   │   └── providers/   # livekit 实现
│   │   ├── signal/          # WebSocket 信令 Hub
│   │   ├── authstate/       # JWT 黑名单/密钥轮换 (NATS KV)
│   │   └── pkg/             # errors/response/jwt + oauth 抽象
│   └── docs/                # swagger.yaml/json
├── web/             # React 19 前端 (@gospeak/web)
│   ├── src/
│   │   ├── pages/           # 文件路由 → routeTree.gen.ts
│   │   ├── api/             # apiClient (axios) + typed API
│   │   ├── socket/          # WebSocket client
│   │   ├── stores/          # zustand (useXxxStore + xxxStore 门面)
│   │   ├── hooks/           # React hooks (media / useAuthParallax / useUpload / useErrorHandler — 重抛异步错误到最近边界)
│   │   ├── components/      # 业务组件（通用 UI 来自 packages/components；common/ 含错误边界 ErrorBoundary/PageErrorBoundary/RouteErrorComponent）
│   │   ├── layouts/         # layout.tsx + common/
│   │   ├── types/
│   │   └── utils/           # errorReport.ts 统一错误上报（installGlobalErrorHandlers 全局兜底）
│   └── docs/                # 前端设计文档
└── docs/            # VitePress 文档站
packages/
├── components/      # UI 组件库 (Radix + 主题 token)
├── sfu-client/      # 前端 SFU 客户端
└── desktop/         # 桌面能力 SDK（MyGo 桥接 + 条件编译）
test/                # 集成测试 (@gospeak/test)
deploy/              # docker-compose + Caddyfile + LiveKit 配置（入口见 DEPLOY.md）
docs/                # 设计/运维/历史档案
```

### 分层调用流

```
Request → Router → Middleware(JWT+RBAC+Ban) → Handler → Service → Repository → DB
                                                    ↓         ↓
                                                   SFU      AuthState
                                                    ↓
                                                 Signal/WS
```

每层只与正下层通信。Service 返回 `*pkg.AppError`，Handler 用 `pkg.HandleError` 转 JSON。

---

## 常用命令

```bash
# 安装
pnpm install

# 启依赖服务（档位由 deploy/.env 的 COMPOSE_PROFILES 决定，默认 app,livekit）
docker compose -f deploy/docker-compose.yml up -d

# 开发 (turbo 并行起后端+前端)
pnpm dev          # = turbo run dev --filter=@gospeak/server --filter=@gospeak/web
pnpm dev:all      # 全部 dev 任务（含 packages 的 tsc --watch）

# 单独
pnpm dev:server   # air 热重载（配置加载见下方『环境变量』）
pnpm dev:web      # vite

# 桌面端（Go 1.27+，见 app/desktop/README.md）
GOSPEAK_TARGET=desktop pnpm --filter @gospeak/web build   # 按桌面目标构建前端
pnpm --filter @gospeak/desktop-app dev                    # mygo dev（WebView 指向 vite）

# 文档站
pnpm --filter @gospeak/docs dev      # VitePress 本地预览
pnpm --filter @gospeak/docs build    # 构建静态站

# 生产
pnpm prod:server          # go run main.go server -e prod
pnpm build                # turbo 全量构建（web + server + docs + packages，带缓存）
pnpm build:server         # 输出 app/server/gospeak
docker build -t gospeak .  # 一体镜像，端口 8998 (见根 Dockerfile)

# 测试
pnpm test            # turbo 跑全部单测（web / sfu-client / components / 集成）
pnpm test:server     # API 集成测试 (test/，自动拉起临时 server)
pnpm test:web        # web vitest 单测

# Lint / Typecheck / Format
pnpm lint        # turbo lint（biome check + go vet）
pnpm check       # turbo check（biome check，不自动修复）
pnpm typecheck   # turbo typecheck（tsc --noEmit，按包并行）
pnpm format      # biome format -r

# CI (手动触发)
# GitHub Actions UI → CI (manual) → Run workflow
```

### 启动参数

- `main.go server` — 未指定 `-e` 时默认 **dev**
- `main.go server -e prod` — 生产环境
- `main.go server -e dev` — 显式开发环境
- `main.go version` — 版本号 (见 `VERSION`)
- 启动时由 `config.LoadEnvFiles()` 按优先级加载（见下）

---

## 环境变量

完全由 env 驱动，无独立配置文件。详见 `docs/deployment-guide.md` 第 3 节。

关键项:
- `SFU_PROVIDER` = `livekit`
- `DB_TYPE` = `SQLite` | `PostgreSQL` | `MySQL`
- NATS 固定内嵌运行（不支持 `NATS_URL`）；JWT 黑名单/密钥轮换走 NATS KV
- `STORAGE_ENCRYPT_KEY` 生产必设 (64 位 hex)

配置加载优先级：`GOSPEAK_ENV_FILE`（显式）> 工作目录 `.env.<env>` / `.env`（本地开发可选）> 仓库根 `deploy/.env`（统一配置，compose 与应用共用）。仓库不提交任何 `.env*` 文件，样例见 `deploy/.env.example`。

---

## API 规范

### 统一响应

```json
{ "code": 0, "msg": "success", "data": {} }
```

错误时 `data` 恒 `null`。完整状态码定义见 `app/server/internal/pkg/errors.go`（0 成功，1xxx 认证，2xxx 参数，3xxx 资源，5xxx 系统，6xxx SFU，7xxx OAuth，8xxx 邮件，81xx 存储）。

### 错误处理范式

```go
// Service — 返回 *AppError
return nil, pkg.NewAppError(pkg.NOT_FOUND, "user not found")

// Handler — HandleError 自动映射
pkg.HandleError(c, err)

// 校验 — 直接 Fail
pkg.Fail(c, pkg.INVALID_PARAMS, err.Error())
```

### 路由

全部 `/api/v1/` 前缀。精确路由表见 `app/server/internal/router/routes/*/routes.go`。认证路由在 `protected` 组下走 `middleware.JWTAuth() + middleware.BanCheck()`。

OpenAPI: `app/server/docs/swagger.yaml`，访问 `/swagger/*any`。

---

## SFU 抽象层

`internal/sfu/`:
- `Provider` 接口 — token/adminToken/rooms/participants/mute/remove/delete/getHost
- `factory.go` — 按 `SFU_PROVIDER` 实例化
- `NewDynamicProvider(resolve)` — 运行时解析，服务层统一调用 `sfu.Provider`，禁止在 handler 泄漏 provider 分支

当前仅支持 LiveKit。

新增 SFU 后端的前置条件见根 `AGENTS.md` §5.3；当前 `SFU_PROVIDER` 固定为 `livekit`，不要新增第二后端。

---

## 代码规范

仓库级开发范式约束（分层、协议、UI token、桌面边界、Git/文档）完整版见根 `AGENTS.md` §4；以下是速查。

1. 代码中**不加注释**，除非复杂逻辑必须
2. 代码中**不用 emoji**，仅文档可用
3. Service 返回 `*AppError`（存量有少量 `fmt.Errorf` 遗留；新增代码必须用 AppError），Handler 决定响应格式
4. Go 文件 `snake_case`，类型 `PascalCase`
5. import 分三组: 标准库 / 第三方 / 内部，空行分隔
6. Handler 方法接 `*gin.Context`，无返回值
7. Service 方法返回 `(result, error)`，error 必为 `*AppError`
8. Repository 错误可为 `gorm.ErrRecordNotFound`

---

## Git 工作流

- commit 规范: Conventional Commits (`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`), enforced by commitlint + lefthook
- 分支: `release`(生产，默认分支) / `dev`(开发) / `feature/*`
- PR 前确认 lint + build 通过

---

## 新增功能流程

1. 定义 model → `internal/model/`
2. repository → `internal/repository/`
3. service → `internal/service/`
4. handler → `internal/handler/`
5. 路由 → `internal/router/routes/<module>/routes.go`
6. 注册 → `internal/router/router.go`
7. 依赖注入 → `server/gin.go`
8. 测试 → `test/`
9. 重新生成 Swagger docs

---

## 测试日志

agent 测试需把结果 Markdown 存到 `agent_test_logs/`。命名 `{内容}-{时间}.md`。模板见 `agent_test_logs/AGENTS.md`。

---

## 关键参考

- 部署: `docs/deployment-guide.md`
- 架构图: `ARCHITECTURE.md`
- 完整 Agent 指南(含开发范式约束与单一事实源索引): `AGENTS.md`
- SFU 成熟度: `docs/sfu-provider-maturity.md`
