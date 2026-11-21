# 发现域页面视觉优化 — 英雄引导方案（方案 C）

- 日期：2026-11-21
- 状态：设计已确认，待审查后进入实现计划
- 目标页面：`app/web/src/pages/(app)/discover.tsx`（路由 `/discover`，「发现域」）

## 1. 目标与范围

用户选择「视觉观感优先」，并从 3 个方向中选定 **C · 英雄引导**：在发现域页顶部加入紫色渐变英雄区，承载搜索/邀请码单一入口与 3 个快捷操作，强化「进入/创建」引导。

**范围**：仅发现域页面的视觉与布局重组。不引入新配色（复用现有 indigo 主色 / acid 亮色 token），不改数据模型、协议、后端、依赖，不改其他页面。

**非目标**：不改交互语义（搜索、邀请码预览、加入、新建域、随机加入均为现有逻辑的转发），不做信息架构层面的重构（方案 B），不做卡片精修（方案 A）。

## 2. 现有代码基线

| 文件 | 现状 |
|------|------|
| `app/web/src/pages/(app)/discover.tsx` | 399 行，页面编排：`ManageHeader` + 左侧「查找并加入」面板 + 「公开域」网格 + 底部「我的域」/「分享链接」并排 |
| `DiscoverJoinPanel.tsx` | 分离式的「搜索公开域」表单 + 分隔线 + 「邀请码加入」表单 |
| `DiscoverDomainGrid.tsx` / `DiscoverDomainCard.tsx` | 公开域 2 列网格、分页、加载/错误/空态 |
| `DiscoverMyDomains.tsx` | 已加入域列表，react-query + zustand |
| `InviteCodeManager.tsx` | 邀请码创建与分享（在 `components/domain/`） |

关键可复用逻辑（不重新实现）：
- `extractDomainInviteCode(input)`：判断输入是邀请码/链接还是搜索词
- `handleSearch` / `handleInviteSubmit` / `openPreview` / `setCreateOpen(true)`
- `useKeepAliveActive` 控制可见时才刷新公开域
- 挂载时剪贴板邀请码自动预览（`shouldAutoOpenInvitePreview`）

## 3. 设计规格

### 3.1 新增组件 `DiscoverHero.tsx`

位置：`app/web/src/components/discover/DiscoverHero.tsx`

职责：纯展示 + 事件转发。props：

```ts
interface DiscoverHeroProps {
  value: string;              // 统一输入框内容（原 searchInput / inviteInput 合并）
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;  // 页面内判定：邀请码 -> openPreview；否则 -> handleSearch
  onCreateDomain: () => void;  // setCreateOpen(true)
  onRandomJoin: () => void;    // 复用现有「随机加入房间」逻辑
  onGoMyDomain: () => void;    // 进入第一个我的域；无域时禁用
  hasMyDomain: boolean;
}
```

视觉结构：
- 容器：`rounded-panel`（xl 档）、`bg-primary` 渐变（indigo 亮→暗，light/dark 均用同一色相梯度）、内边距 `p-6 md:p-8`
- 大标题：`text-2xl font-bold text-primary-foreground`（如「找到你的下一个语音房」）
- 副标题：`text-sm text-primary-foreground/85`（说明文案）
- 统一搜索框：半透明白底（`bg-primary-foreground/10`）、白色占位符（`placeholder:text-primary-foreground/70`）、右侧白色「搜索」按钮
- 3 个快捷胶囊：`rounded-pill border border-primary-foreground/30 bg-primary-foreground/10`，图标用 lucide（`CirclePlus` / `Shuffle` / `ArrowUpRight`），尺寸 `size=16`
- 装饰：右上角半透明圆形径向光晕（纯 CSS `::after`，`pointer-events-none`），`prefers-reduced-motion` 下无动画

### 3.2 页面改动 `discover.tsx`

- 用 `<DiscoverHero ... />` 替换原 `<ManageHeader>` + `<DiscoverJoinPanel>` 组合（含左侧栅格中的「查找并加入」`ManageSection`）
- 状态合并：`searchInput` 与 `inviteInput` 合并为单一 `heroInput`（保留 `keyword` 用于实际搜索）
- `onSubmit` 统一入口逻辑：
  1. `const code = extractDomainInviteCode(heroInput)`
  2. 若 `code` 存在 → `void openPreview(code)`
  3. 否则 → 走原 `handleSearch`（`setPage(1); setKeyword(heroInput.trim())`）
- 原挂载时剪贴板自动预览逻辑保留，但改为写入 `heroInput`（不再写 `inviteInput`）
- 「公开域」网格与「我的域」/「分享链接」区块保持原位，仅上方新增 hero；去掉左侧栏后主区改为单列全宽
- 「新建域」按钮在 hero 内（快捷胶囊第一个）+ 公开域标题区保留一个，共用 `setCreateOpen(true)`

### 3.3 快捷操作行为

| 胶囊 | 行为 | 边界 |
|------|------|------|
| 快速创建房间 | `setCreateOpen(true)` | 复用现有 `CreateDomainModal` |
| 随机加入 | 复用首页「随机加入房间」逻辑：从 `publicDomains` 中随机取一个活跃域进入 | 无公开域时禁用按钮并显示 `title` 提示 |
| 前往我的域 | `navigate('/domain/$domainUUID')` 进入 `myDomainUUIDs[0]` | 无已加入域时禁用 |

## 4. 错误处理与边界

- 邀请码无效：沿用 `openPreview` 的 `previewError` + `DomainJoinPreviewModal` Dialog 提示，不新增错误态
- 空公开域：hero 下方 `DiscoverDomainGrid` 照常显示「暂无公开域」
- 可访问性：hero 输入框 `aria-label="搜索公开域或输入邀请码"`；按钮保留 focus-visible 环；渐变上的文字对比度 ≥ 4.5:1；装饰光晕 `aria-hidden`；`prefers-reduced-motion` 下无过渡
- 主题：light/dark 均使用 `--primary` 色相渐变，dark 下适当降低亮度保证白字可读；不写死 HEX

## 5. 测试与验证

- **不新增单测**：`DiscoverHero` 为纯展示 + 事件转发组件，逻辑均复用页面已测函数
- 验证手段：`pnpm typecheck`、`pnpm --filter @gospeak/web build`、`pnpm lint:radius`/`lint:ui`（token 护栏）、`pnpm test:web`（确保现有测试不回归）
- 视觉验收：本地 `localhost:3000/discover` 对照精细原型；检查 light/dark、375/768/1440 宽度

## 6. 风险与回退

- 风险：hero 占据首屏约 200px，公开域首屏可见数量减少 → 缓解：hero 高度控制在 `~180px`，快捷键胶囊与搜索同一视觉组
- 回退：改动集中在 1 个新文件 + 1 个页面文件，回退只需还原 `discover.tsx` 并删除 `DiscoverHero.tsx`

## 7. 实现顺序（交由 writing-plans 细化）

1. 新建 `DiscoverHero.tsx`（纯组件 + token 类名）
2. 修改 `discover.tsx`：状态合并、统一 onSubmit、替换 header+join panel、保持原有预览/加入/剪贴板逻辑
3. 跑 typecheck / lint:ui / lint:radius / build / test:web
4. 本地视觉验收（light/dark、响应式）
