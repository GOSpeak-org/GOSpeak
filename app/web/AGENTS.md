# app/web — React 19 前端包

`@gospeak/web`：SPA 客户端。直接消费 workspace 源码（`@gospeak/components`、`sfu-client`、`desktop`），不产出独立包。

> 技术栈与编码约定见 [docs/AGENTS.md](docs/AGENTS.md)；源码结构见 [src/AGENTS.md](src/AGENTS.md)。

## 命令

```bash
pnpm dev              # Vite，端口 3000
pnpm build            # vite build + tsc
pnpm build:desktop    # GOSPEAK_TARGET=desktop（桌面目标）
pnpm typecheck        # tsr generate && tsc --noEmit
pnpm test             # vitest run
```

## 构建期常量（`vite.config.ts` 注入）

| 常量 | 来源 | 用途 |
|------|------|------|
| `__GOSPEAK_TARGET__` | `GOSPEAK_TARGET` | `"web"` / `"desktop"` |
| `__GOSPEAK_DESKTOP__` | 同上 | 布尔，桌面分支开关 |
| `__APP_VERSION__` | `package.json` version | 导出日志版本头 |

类型声明在 `types/gospeak-build.d.ts`。

## 路由生成

`tanstackRouter` 插件内联配置：`routesDirectory: ./src/pages`、`generatedRouteTree: ./src/routeTree.gen.ts`、`routeFileIgnorePrefix: "-"`、`routeFileIgnorePattern: "components"`。**`routeTree.gen.ts` 是生成物，不要手改**。

## 代理（开发）

`/api/v1`、`/ws`、`/uploads` → `localhost:8998`。另有一条 `/rtc/v1` → `1985` 是 SRS 时代的残留，当前应用不使用，**不要基于它写新代码**。

## 构建产物

- 分包：`vendor`(react) / `router`(tanstack) / `ui`(radix+clsx+sonner+lucide)，入口 `entries/`、异步 `chunks/`、资源 `assets/`。
- 体积分析：`BUILD_STATS=1 pnpm build` → `dist/stats.html`（treemap）。
- turbo `outputs`: `dist/**` + `.tanstack/**`。
- 桌面构建产物会被 `app/desktop` 的 `mygo.config.ts` 同步进 `webui/dist` 供 go:embed。

## 约束

- 改 `app/desktop` 或 `packages/desktop` 后必须跑一次 `build:desktop` 验证。
- 不要在页面里直接 import provider SDK 或桌面原生能力，走 `@gospeak/sfu-client` / `inDesktop()`。
- 视觉回归基线在 `visual-baseline/`，改 UI 前先对照。
