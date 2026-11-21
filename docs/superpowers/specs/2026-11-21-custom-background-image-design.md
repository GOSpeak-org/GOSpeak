# 自定义背景图：个人全局背景 + 三档玻璃强度

日期：2026-11-21
分支：dev-1121（工作区已有 domain layout 未提交改动，本变更与其文件零交集）

## 背景与目标

外观设置（`app/web/src/components/modal/settingModal/tab_item/appearance.tsx`）目前只有深色模式开关与八套主题卡片。目标：允许用户上传图片作为**个人全局背景**，铺在整个应用（body 层）之下，并通过三档预设控制面板透明化程度。

brainstorm 已定决策（2026-11-21 视觉伴侣对比）：

- 作用范围：个人全局，仅影响自己；
- 图源：仅本地上传，不走 storage 上传链路（presign/confirm 不涉及，任何裸部署实例开箱即用）；
- 持久化：图片 Blob 存 IndexedDB，偏好存 localStorage——纯前端，零后端改动；
- 深色/浅色模式各设一张图，交互跟随「当前正在配置的模式」（与主题区同构）；
- 呈现：三档玻璃强度预设（非自由滑杆），默认档 `balanced`。

## 非目标

- 不跨设备同步（与主题偏好现状一致，localStorage 生命周期）；
- 不做自由滑杆、不做内置图库、不做 URL 输入、不做域级背景；
- 不做多标签页实时同步（与 themeStore 现状一致）；
- 不改移动端 `components/mobile/settingsPage.tsx`（其外观区目前仅占位行）；
- 不做「启用背景」独立开关（无图=关闭，删图即关）；
- 不触碰工作区已有的 domain layout 改动。

## 设计

### A. 存储层

- IndexedDB：数据库 `gospeak-web`，object store `backgrounds`，key `light` / `dark`，value 为压缩后 Blob。**「有无图」以记录存在与否为单一事实源**，不在 localStorage 重复记录。
- 新增 `app/web/src/utils/backgroundDb.ts`：手写 put/get/delete 封装（约 40 行），不引入依赖。
- 偏好 localStorage key：`background-tier-light` / `background-tier-dark`，值 `subtle` | `balanced` | `immersive`，命名风格与 themeStore 的 `theme-*` 一致。

### B. 图片压缩（`utils/backgroundImage.ts`）

- 选图后 canvas 等比压缩：最长边 ≤ 2560px；
- 导出 `toBlob("image/webp", 0.95)`，浏览器不支持 webp 导出时回退 JPEG 0.95；
- 输入校验：文件 type 非 `image/*` 直接拒绝（toast），不进压缩流程；
- 压缩失败：toast 提示，保持现状不变。

### C. Store（`stores/backgroundStore.ts`）

- zustand「命令式门面 + hook」双入口（`backgroundStore` + `useBackgroundStore`），组件用 selector 订阅，与 themeStore 同款模式；
- state：`lightTier` / `darkTier`、`hasLight` / `hasDark`、`activeUrl: string | null`（当前模式图片的 objectURL）；
- actions：`init()`（启动读库 → 设 has* → 生成 URL → applyToDom）、`setImage(mode, file)`、`removeImage(mode)`、`setTier(mode, tier)`；
- objectURL 生命周期：set / remove 时 revoke 旧 URL；
- 与 themeStore 联动：backgroundStore 内订阅 themeStore 的 `isDark`，模式切换时刷新 `activeUrl` 与 DOM 应用。

### D. DOM 应用

`applyBackground()`：

- `<html>` 上 toggle class `bg-custom` + 写 `data-bg-tier="subtle|balanced|immersive"`；
- `body.style.backgroundImage = url(objectURL)`（cover / center / fixed）；
- 无图时三者全部清空，界面完全回到现状。

三档常量（面板 alpha + blur 一起变）：

| 档 | --card alpha | --muted alpha | blur | saturate |
|----|-------------|---------------|------|----------|
| subtle 轻透 | 85% | 72% | 6px | 1 |
| balanced 均衡 | 68% | 50% | 14px | 1 |
| immersive 沉浸 | 40% | 26% | 20px | 1.3 |

### E. 主题 CSS（`packages/components/src/theme.css`）

- 每个主题块将 `--card` / `--muted` 原始值同步存一份 `--card-base` / `--muted-base`（机械重复 8 套，深浅自动随激活主题）；
- 新增规则：`html.bg-custom[data-bg-tier=…]` 下用 `color-mix(in oklab, var(--card-base) α%, transparent)` 覆盖 `--card` / `--muted` 为半透明版，并输出 `--bg-blur` / `--bg-saturate` 变量；
- 新增工具类 `surface-glass`：`backdrop-filter: blur(var(--bg-blur)) saturate(var(--bg-saturate))`，仅 `html.bg-custom` 下生效；加到布局**外壳级**表面上（`layout.tsx` 的 Main `bg-muted` 容器、工作区与管理页容器/面板、设置弹层等）；内层嵌套小卡片不单独加 blur，靠继承半透明变量叠透；
- 侧边栏列表区本无整体背景，图直接可见，无需处理；
- 遵守 theme.css 头部暗色派生四条规则；圆角/字号等其余 token 不动；禁任意值规则不放宽（blur 半径属新增 token `--bg-blur`，非任意值内联）。

### F. 设置 UI（`tab_item/appearance.tsx` 内新增 Section）

- 位置：主题选择区之后，Section「背景图」；
- 说明文字与主题区句式一致：「当前正在配置 浅色 模式背景（跟随上方深色模式开关切换）」；
- 有图：16:9 预览（objectURL）+ 「更换 / 删除」操作；无图：虚线上传框，点击触发隐藏 file input（`accept="image/*"`）；
- 「玻璃强度」三选 segmented（轻透 / 均衡 / 沉浸），无图时置灰；
- 删除不做二次确认（重传成本低，用户主动操作）；
- Section 逻辑抽为同目录 `BackgroundSection.tsx`，appearance.tsx 只做编排。

### G. 错误处理与降级

- IndexedDB 打开失败 / 写入配额失败：toast 提示背景图功能不可用，Section 控件置灰，不影响其余设置；
- Blob 损坏（应用背景时 `Image` 解码 onerror）：静默删除该记录，回退无背景现状；
- 桌面端 WebView 支持 IndexedDB，无需 `@gospeak/desktop` 能力介入。

### H. 测试

- `utils/backgroundImage.test.ts`：输出格式 / 最长边约束 / 非图片输入拒绝；
- `utils/backgroundDb.test.ts`（fake-indexeddb devDep）：put / get / delete 往返；
- `stores/backgroundStore.test.ts`：setImage / removeImage / setTier 状态迁移、旧 URL revoke、tier 持久化；
- `BackgroundSection` 组件测试：上传触发、无图置灰、删除清理；
- 视觉验收：8 主题 × 深浅 × 三档抽查（含内层嵌套面板叠透效果）。

## 实现顺序提示（给 writing-plans）

backgroundDb → backgroundImage → backgroundStore → theme.css 玻璃层 → DOM 应用联调 → BackgroundSection UI → 测试补齐。theme.css 的 `-base` 变量复制量大但机械，建议在实现计划中单列为独立步骤以便 review。
