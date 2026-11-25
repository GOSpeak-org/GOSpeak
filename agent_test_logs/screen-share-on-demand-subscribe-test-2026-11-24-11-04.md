# 屏幕共享按需订阅 — 全量验证测试记录

**测试时间**: 2026-11-24 11:03:00 ~ 11:07:00
**测试环境**: dev（worktree: screen-share-on-demand，分支 HEAD baa9a448）
**测试模型**: deepseek-v4-flash

## 测试概要

对「屏幕共享按需订阅」功能分支（Task 1~6 合并后）执行全量门禁与构建验证，覆盖 sfu-client 与 web 单测、TypeScript 类型检查、全仓 lint、Web/桌面构建。目的是确认分支改动未破坏现有功能，并记录与本分支无关的既有问题。

## 测试结果

| 测试项 | 状态 | 说明 |
|--------|------|------|
| pnpm --filter @gospeak/sfu-client test | ✅ 通过 | 8 个测试文件、53 个测试全部通过 |
| pnpm --filter @gospeak/web test | ✅ 通过 | 125 个测试文件、696 个测试全部通过 |
| pnpm typecheck | ✅ 通过 | turbo 5/5 任务成功，无类型错误 |
| pnpm lint | ✅ 通过 | turbo 6/6 任务成功，无 hook deps 新增告警 |
| pnpm build | ❌ 失败 | @gospeak/desktop-app#build：go:embed all:webui/dist 无匹配文件（基线问题，与本分支无关；单独运行 desktop-app 构建同样失败） |
| pnpm --filter @gospeak/web build:desktop | ✅ 通过 | 桌面目标 Vite 构建完成，仅有既存 chunk 体积警告 |
| pnpm --filter @gospeak/web build（附加验证） | ✅ 通过 | Web 生产构建完成 |
| pnpm --filter @gospeak/sfu-client build（附加验证） | ✅ 通过 | tsc 编译完成 |

## 详细测试记录

### 1. sfu-client 单元测试

**命令**:
```bash
pnpm --filter @gospeak/sfu-client test
```

**关键输出**:
```
✓ src/livekit-client.video-subscription.test.ts (4 tests)
✓ src/livekit-client.reconnect.test.ts (4 tests)
✓ src/screen-share-quality.test.ts (14 tests)
...
Test Files  8 passed (8)
     Tests  53 passed (53)
  Duration  466ms
```

**结论**: ✅ 通过。包含本分支新增的视频发布订阅/取消订阅测试。

### 2. Web 单元测试

**命令**:
```bash
pnpm --filter @gospeak/web test
```

**关键输出**:
```
✓ src/stores/screenShareStore.test.ts (7 tests)
✓ src/components/room/VoiceSessionProvider.videoSubscription.test.tsx
...
Test Files  125 passed (125)
     Tests  696 passed (696)
  Duration  39.87s
```

**结论**: ✅ 通过。包含本分支新增/修改的 screenShareStore、VoiceSessionProvider、roomDetail 等测试。

### 3. 类型检查

**命令**:
```bash
pnpm typecheck
```

**关键输出**:
```
Tasks:    5 successful, 5 total
Cached:   0 cached, 5 total
```

**结论**: ✅ 通过。仅有路由生成器关于测试文件不导出 Route 的既存警告，与本分支无关。

### 4. Lint 检查

**命令**:
```bash
pnpm lint
```

**关键输出**:
```
@gospeak/web:lint: Checked 401 files in 193ms. No fixes applied.
@gospeak/sfu-client:lint: Checked 22 files in 53ms. No fixes applied.
Tasks:    6 successful, 6 total
```

**结论**: ✅ 通过。无 biome / go vet 错误，无 hook deps 棘轮新增告警。

### 5. 全量构建

**命令**:
```bash
pnpm build
```

**关键输出**:
```
@gospeak/desktop-app:build: error: go build failed:
@gospeak/desktop-app:build:   proxyserver.go:51:12: pattern all:webui/dist: no matching files found
Failed:    @gospeak/desktop-app#build
Tasks:    4 successful, 8 total
```

**结论**: ❌ 失败。失败点为桌面宿主 Go 嵌入资源 `all:webui/dist` 缺失。经串行重跑及单独执行 `pnpm --filter @gospeak/desktop-app build` 均复现。本分支改动仅涉及 app/web、packages/sfu-client、docs/superpowers/plans 与 .github/workflows/build-mobile.yml，未触碰 app/desktop；该失败为仓库基线前置条件/工具链（MyGo v0.10.0 与文档所述 0.8.3 不一致）问题，按任务约束不越界修复，记录为关注项。

### 6. 桌面目标构建

**命令**:
```bash
pnpm --filter @gospeak/web build:desktop
```

**关键输出**:
```
✓ built in 1.70s
(!) Some chunks are larger than 500 kB after minification.
```

**结论**: ✅ 通过。条件编译涉及的桌面目标构建成功，chunk 体积警告为既存问题。

### 7~8. 附加单独构建（隔离全量构建失败影响）

**命令**:
```bash
pnpm --filter @gospeak/web build
pnpm --filter @gospeak/sfu-client build
```

**结论**: ✅ 均通过。可确认本分支实际改动的代码在生产构建下无编译错误。

## 问题与建议

1. **全量构建失败（既有问题）**: `pnpm build` 因 `@gospeak/desktop-app` 的 `//go:embed all:webui/dist` 找不到文件而失败；串行与单独执行均复现，与本分支无关。建议后续由桌面宿主负责人确认 MyGo 版本与 `mygo.config.ts` 的 `buildCommand` 执行时机，或在 CI 构建前置步骤中显式生成 `app/desktop/webui/dist`。
2. **Webpack/Vite chunk 体积警告（既存）**: 桌面构建与 Web 构建均提示 livekit-client chunk >500 kB，不影响构建成功。
3. **路由生成器警告（既存）**: typecheck 时 tsr 提示部分 `__tests__/*.test.ts` 文件不导出 Route，不影响类型检查结果。

## 总结

本分支的 4 项核心门禁（sfu-client test、web test、typecheck、lint）与桌面目标构建全部通过；全量构建 `pnpm build` 因本分支未触碰的桌面宿主 `webui/dist` 嵌入资源缺失而失败，判定为既有问题。按任务约束未做越界修复。功能分支可按既有流程进入合入评审，但需知悉全量构建的基线失败。
