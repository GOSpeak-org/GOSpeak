# 移动端问题优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 按规格 `docs/superpowers/specs/2026-11-17-mobile-optimization-design.md` 修复 14 项移动端问题（原生能力 4 项、UI/响应式 4 项、性能 6 项）。

**架构：** 三阶段推进：① 原生能力——补 iOS 插件注册、Push 前端接线、Android 前台服务、音频路由回读；② UI——弹窗窄屏/安全区适配、平台判定统一、房间操作入口；③ 性能——休眠 rAF、列表虚拟化、Markdown 缓存、store 订阅收敛。每阶段独立可验证。

**技术栈：** React 19 + TypeScript + Tailwind 4 + zustand + `@tanstack/react-virtual` + Vitest 4；Capacitor 8（Swift / Java 原生插件）；Node 原生门禁脚本（`node --test`）。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `app/mobile/ios/App/App/SceneDelegate.swift` | iOS 自定义插件注册点（补 ServerConfig） |
| `scripts/check-mobile-bridge.mjs` / `.test.mjs` | 桥接契约门禁（补「声明 = 注册」校验） |
| `packages/mobile-capabilities/src/capabilities/push.ts` | Push 能力（权限结果检查 + 句柄去重） |
| `packages/mobile-capabilities/src/capabilities/audio-route.ts` | 音频路由（新增 `refresh()`） |
| `app/web/src/hooks/useMobilePush.ts`（新） | 登录后 Push 注册、token 上报、通知点击跳转 |
| `app/web/src/api/pushRegistration.ts`（新） | token 上报 adapter（默认未配置降级） |
| `app/web/src/hooks/useDeepLinkNavigation.ts` | 导出 `navigateByPath`，供 Push 通知点击复用 |
| `app/web/src/layouts/layout.tsx` | 挂载 useMobilePush；`inMobile()` 平台判定；Pointer Events 拖拽 |
| `app/mobile/android/.../ForegroundAudioService.java`（新） | 前台服务（microphone 类型） |
| `app/mobile/android/.../MediaControlPlugin.java` | 启停前台服务 |
| `app/mobile/android/.../AndroidManifest.xml` | 声明 `<service>` |
| `app/mobile/android/.../AudioSessionPlugin.java` | 默认外放 + 状态恢复 |
| `app/web/src/hooks/useMobileAudioRoute.ts` | 挂载/切换后 `refresh()` |
| `app/web/src/components/modal/notificationModal.tsx`（+.test） | 窄屏单栏 + dvh |
| `app/web/src/components/modal/createRoomModal.tsx` / `editRoomModal.tsx` | 弹窗可滚动容器 |
| `app/web/src/components/modal/settingModal/settingModal.tsx`（+.test） | 安全区 padding + dvh |
| `app/web/src/components/room/components/roomItem.tsx` | 可见「…」菜单入口 |
| `app/web/src/hooks/useAuthParallax.ts`（+新 test） | rAF 休眠 |
| `app/web/src/components/room/roomList.tsx` / `components/common/avatar.tsx` | 虚拟化 + 成员折叠 + 头像懒加载 |
| `app/web/src/components/textRoom/MarkdownText.tsx` / `MessageItem.tsx` / `utils/markdownCache.ts`（新） | memo + LRU 缓存 |
| `app/web/src/stores/socketStore.ts` / `components/userBar.tsx` / `components/chat/chatWindow.tsx` | selector 收敛 |
| `app/web/src/components/textRoom/MessageList.tsx` / `hooks/useCoarsePointer.ts` | O(1) 查找 + 共享媒体查询 |

---

## 阶段一：原生能力

### 任务 1：iOS 注册 ServerConfigPlugin

**文件：**
- 修改：`app/mobile/ios/App/App/SceneDelegate.swift:48-56`
- 修改：`scripts/check-mobile-bridge.mjs`
- 测试：`scripts/check-mobile-bridge.test.mjs`

- [ ] **步骤 1：在 `check-mobile-bridge.test.mjs` 新增失败测试**

```js
import { checkPluginRegistration, extractRegisteredPlugins } from "./check-mobile-bridge.mjs";

test("extractRegisteredPlugins 收集 Swift 与 Java 的插件注册", () => {
	const swift = `if bridge.plugin(withName: "AudioSession") == nil {
	    bridge.registerPluginInstance(AudioSessionPlugin())
	}
	if bridge.plugin(withName: "ServerConfig") == nil {
	    bridge.registerPluginInstance(ServerConfigPlugin())
	}`;
	const java = "registerPlugin(new ServerConfigPlugin());";
	const ios = extractRegisteredPlugins(swift, "swift");
	const android = extractRegisteredPlugins(java, "java");
	assert.deepEqual([...ios].sort(), ["AudioSession", "ServerConfig"]);
	assert.deepEqual([...android], ["ServerConfig"]);
});

test("checkPluginRegistration 报出未注册插件", () => {
	const result = checkPluginRegistration({
		declared: new Set(["AudioSession", "MediaControl", "ServerConfig"]),
		ios: new Set(["AudioSession", "MediaControl"]),
		android: new Set(["AudioSession", "MediaControl", "ServerConfig"]),
	});
	assert.deepEqual(result.iosMissing, ["ServerConfig"]);
	assert.deepEqual(result.androidMissing, []);
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test scripts/check-mobile-bridge.test.mjs`
预期：FAIL，`extractRegisteredPlugins is not a function`

- [ ] **步骤 3：在 `check-mobile-bridge.mjs` 实现注册提取与校验**

导出 `extractRegisteredPlugins(source, platform)`：Swift 用 `bridge.registerPluginInstance((\w+)())` 收集类名，再映射为 `bridge.plugin(withName: "X")` 中的 X；Java 用 `registerPlugin(new (\w+)())` 收集；对 Swift 同时收集 `jsName = "X"` 声明。导出 `checkPluginRegistration({ declared, ios, android })`：`declared` 来自 TS 能力层的 `pluginMethod("Plugin", ...)` 插件名集合，返回 `iosMissing` / `androidMissing` 排序数组。在 `main()` 中读取 `IOS_DIR` 的 `.swift` 与 `ANDROID_DIR` 的 `MainActivity.java`，任一平台缺失即打印文件名与缺失插件名并 `process.exitCode = 1`。

- [ ] **步骤 4：在 `SceneDelegate.swift` 补注册**

在 `registerCustomPlugins(on:)` 末尾追加：

```swift
    if bridge.plugin(withName: "ServerConfig") == nil {
        bridge.registerPluginInstance(ServerConfigPlugin())
    }
```

- [ ] **步骤 5：运行测试与门禁确认通过**

运行：`node --test scripts/check-mobile-bridge.test.mjs && node scripts/check-mobile-bridge.mjs`
预期：全部 PASS；门禁退出码 0

- [ ] **步骤 6：Commit**

```bash
git add app/mobile/ios/App/App/SceneDelegate.swift scripts/check-mobile-bridge.mjs scripts/check-mobile-bridge.test.mjs
git commit -m "fix(mobile): 注册 iOS ServerConfig 插件并补注册门禁"
```

### 任务 2：Push 前端接线

**文件：**
- 修改：`packages/mobile-capabilities/src/capabilities/push.ts`
- 创建：`app/web/src/hooks/useMobilePush.ts`、`app/web/src/hooks/useMobilePush.test.tsx`
- 创建：`app/web/src/api/pushRegistration.ts`
- 修改：`app/web/src/hooks/useDeepLinkNavigation.ts`、`app/web/src/layouts/layout.tsx`

- [ ] **步骤 1：编写失败测试 `useMobilePush.test.tsx`**

```tsx
vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createPush: () => ({
		register: vi.fn().mockResolvedValue("tok-1"),
		onToken: vi.fn((h) => { h("tok-1"); return () => {}; }),
		onNotificationOpened: vi.fn(() => () => {}),
	}),
}));
vi.mock("@/api/pushRegistration", () => ({ reportPushToken: vi.fn().mockResolvedValue(undefined) }));

test("移动端注册 push 并上报 token", async () => {
	renderHook(() => useMobilePush());
	await waitFor(() => expect(reportPushToken).toHaveBeenCalledWith("tok-1"));
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm --filter @gospeak/web test -- useMobilePush`
预期：FAIL，模块 `useMobilePush` 不存在

- [ ] **步骤 3：修正 `push.ts` 权限与句柄**

把 `const result = await plugin.requestPermissions()` 的返回值纳入判断：`result.receive !== "granted"` 时 `console.warn` 并直接 return，不注册监听、不调 `register()`；把 `listenPlugin` 返回的两个 unsubscribe 保存为 `unsubscribers: (() => void)[]`，在 `start()` 失败时逐个调用并清空，再把 `started` 置回 false。

- [ ] **步骤 4：实现 `pushRegistration.ts` adapter**

导出 `reportPushToken(token: string): Promise<void>`；默认实现读取可选注入的 reporter，未配置时 `console.info("[push] token 上报未配置", token.slice(0, 6))` 并返回，不抛错。导出 `setPushTokenReporter(fn)` 供后续后端接入。

- [ ] **步骤 5：导出 `navigateByPath` 并实现 `useMobilePush`**

从 `useDeepLinkNavigation.ts` 导出当前 `go` 的逻辑为 `navigateByPath(router, target)`（保留 `target.startsWith("/")` 白名单）。`useMobilePush` 在 `inMobile()` 时：`void push.register()`；`push.onToken((t) => void reportPushToken(t))`；`push.onNotificationOpened((d) => { const p = d.path; if (typeof p === "string") navigateByPath(router, p); })`；返回时调用所有退订函数。

- [ ] **步骤 6：在 `layout.tsx` 顶层组件调用 `useMobilePush()`**

- [ ] **步骤 7：运行测试、typecheck、commit**

运行：`pnpm --filter @gospeak/web test -- useMobilePush && pnpm typecheck`
预期：PASS

```bash
git add packages/mobile-capabilities/src/capabilities/push.ts app/web/src/hooks/useMobilePush.ts app/web/src/hooks/useMobilePush.test.tsx app/web/src/api/pushRegistration.ts app/web/src/hooks/useDeepLinkNavigation.ts app/web/src/layouts/layout.tsx
git commit -m "feat(mobile): 接通 Push 前端注册与 token 上报适配器"
```

### 任务 3：Android 前台服务

**文件：**
- 创建：`app/mobile/android/app/src/main/java/dev/gospeak/mobile/ForegroundAudioService.java`
- 修改：`app/mobile/android/app/src/main/java/dev/gospeak/mobile/MediaControlPlugin.java:76-95`
- 修改：`app/mobile/android/app/src/main/AndroidManifest.xml:4-9`

- [ ] **步骤 1：新增 `ForegroundAudioService`**

继承 `android.app.Service`，`onStartCommand` 中用现有锁屏通知的 `Notification.Builder` 调 `startForeground(NOTIFICATION_ID, notification)`；`onBind` 返回 null；`onDestroy` 调 `stopForeground(STOP_FOREGROUND_REMOVE)`。通知 ID 与 `MediaControlPlugin` 共用常量 `MediaControlPlugin.NOTIFICATION_ID`。

- [ ] **步骤 2：Manifest 声明服务**

在 `<application>` 内加入：

```xml
<service
    android:name=".ForegroundAudioService"
    android:exported="false"
    android:foregroundServiceType="microphone" />
```

- [ ] **步骤 3：改写 `MediaControlPlugin` 启停**

`activate()` 中改为 `context.startForegroundService(new Intent(context, ForegroundAudioService.class))`；`deactivate()` 中 `context.stopService(...)`。保留原有 `notificationManager().notify()` 的静音 / 挂断 action 回传逻辑，不得改动 `@PluginMethod(name = ...)` 方法名。

- [ ] **步骤 4：验证**

运行：`node scripts/check-mobile-bridge.mjs && node scripts/mobile-bind-proxyrules.mjs --surface-only`
预期：桥接门禁 PASS（方法名未变）；绑定面 PASS。本机无 Android SDK，编译由手动 `build-mobile` workflow 承担。

- [ ] **步骤 5：Commit**

```bash
git add app/mobile/android/app/src/main/java/dev/gospeak/mobile/ForegroundAudioService.java app/mobile/android/app/src/main/java/dev/gospeak/mobile/MediaControlPlugin.java app/mobile/android/app/src/main/AndroidManifest.xml
git commit -m "fix(mobile): Android 语音房使用 microphone 前台服务"
```

### 任务 4：音频路由状态同步

**文件：**
- 修改：`packages/mobile-capabilities/src/capabilities/audio-route.ts`
- 测试：`packages/mobile-capabilities/src/capabilities/audio-route.test.ts`（如不存在则创建）
- 修改：`app/web/src/hooks/useMobileAudioRoute.ts`
- 修改：`app/mobile/android/app/src/main/java/dev/gospeak/mobile/AudioSessionPlugin.java:26`

- [ ] **步骤 1：编写失败测试**

```ts
test("refresh 读取原生 current 并更新缓存", async () => {
	vi.stubGlobal("__GOSPEAK_MOBILE__", true);
	const plugin = { list: async () => ({ routes: [] }), current: async () => ({ kind: "bluetooth" }), set: async () => {} };
	vi.mock("../bridge", () => ({ getPlugin: async () => plugin }));
	const route = createAudioRoute();
	expect(route.current()).toBe("speaker");
	await route.refresh();
	expect(route.current()).toBe("bluetooth");
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm --filter @gospeak/mobile-capabilities test -- audio-route`
预期：FAIL，`refresh is not a function`

- [ ] **步骤 3：实现 `refresh()`**

在 `AudioRoute` 接口加 `refresh(): Promise<void>`；`createAudioRoute` 内实现：非 mobile 直接 return；`await getPlugin<AudioRoutePlugin>("AudioSession").current()`，用 `isAudioRouteKind` 校验后更新 `current`；catch 中 `console.warn` 并保留原值。

- [ ] **步骤 4：hook 挂载与切换后调用 `refresh()`**

`useMobileAudioRoute` 的 effect 中 `void route.refresh().then(() => setCurrent(route.current()))`；`select()` 在 `await route.set(kind)` 后同样调用 `refresh()` 再 `setCurrent`。

- [ ] **步骤 5：Android 默认外放并恢复状态**

`AudioSessionPlugin.activate()` 把 `audio.setSpeakerphoneOn(false)` 改为 `true`，先用字段 `private boolean previousSpeakerphone` 保存 `audio.isSpeakerphoneOn()`；`deactivate()` 在恢复 mode 后 `audio.setSpeakerphoneOn(previousSpeakerphone)`。

- [ ] **步骤 6：运行测试、typecheck、commit**

运行：`pnpm --filter @gospeak/mobile-capabilities test -- audio-route && pnpm typecheck`
预期：PASS

```bash
git add packages/mobile-capabilities/src/capabilities/audio-route.ts packages/mobile-capabilities/src/capabilities/audio-route.test.ts app/web/src/hooks/useMobileAudioRoute.ts app/mobile/android/app/src/main/java/dev/gospeak/mobile/AudioSessionPlugin.java
git commit -m "fix(mobile): 音频路由回读原生状态并修正 Android 默认外放"
```

---

## 阶段二：UI / 响应式

### 任务 5：通知弹窗窄屏布局

**文件：** `app/web/src/components/modal/notificationModal.tsx:64,82` + `.test.tsx`

- [ ] **步骤 1：编写失败测试**

用 `render` 打开弹窗，断言容器 class 含 `@container`、列表容器 class 含 `@md:w-72` 且含 `w-full`、高度类名含 `dvh` 而非 `vh`。

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm --filter @gospeak/web test -- notificationModal`，预期 FAIL。

- [ ] **步骤 3：改布局**

`DialogContent` 的 `className` 从 `h-[min(80vh,640px)]` 改为 `h-[min(80dvh,640px)] @container`；列表容器 `w-72 shrink-0` 改为 `w-full @md:w-72 shrink-0`；详情区增加 `@md:block` 与窄屏切换态（窄屏下详情区在列表选中后显示、列表隐藏，用一个 `selected` 状态切换 `hidden` 类）。标题区补 `pt-[env(safe-area-inset-top)]`。

- [ ] **步骤 4：运行测试与 commit**

```bash
git add app/web/src/components/modal/notificationModal.tsx app/web/src/components/modal/notificationModal.test.tsx
git commit -m "fix(mobile): 通知弹窗窄屏单栏与 dvh 高度"
```

### 任务 6：表单弹窗可滚动

**文件：** `app/web/src/components/modal/createRoomModal.tsx:179-238`、`editRoomModal.tsx:76-106`

- [ ] **步骤 1：改 `createRoomModal` 容器**

`DialogContent` 的 `className` 改为 `flex max-h-[100dvh] flex-col gap-0 overflow-hidden rounded-lg p-0`；标题 `<div>` 加 `shrink-0`；表单区 `<div className="grid ...">` 改为 `min-h-0 flex-1 overflow-y-auto`；预览 `<aside>` 保留在滚动区内。

- [ ] **步骤 2：改 `editRoomModal` 同样结构**

头部 `shrink-0`、内容 `min-h-0 flex-1 overflow-y-auto`、`DialogContent` `flex max-h-[100dvh] flex-col overflow-hidden`。

- [ ] **步骤 3：验证与 commit**

运行：`pnpm typecheck && pnpm --filter @gospeak/web test -- createRoomModal`

```bash
git add app/web/src/components/modal/createRoomModal.tsx app/web/src/components/modal/editRoomModal.tsx
git commit -m "fix(mobile): 房间表单弹窗可滚动且提交按钮可达"
```

### 任务 7：全屏弹窗安全区

**文件：** `app/web/src/components/modal/settingModal/settingModal.tsx:59-73` + `.test.tsx`

- [ ] **步骤 1：编写失败测试**

断言 `DialogContent` className 含 `pt-[env(safe-area-inset-top)]` 与 `pb-[env(safe-area-inset-bottom)]`，且不含 `90vh`。

- [ ] **步骤 2：运行测试确认失败**

- [ ] **步骤 3：修复**

`className` 中 `sm:h-[min(90vh,820px)]` 改为 `sm:h-[min(90dvh,820px)]`；追加 `pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`。注意 `p-0` 保留，由 padding 工具类补足。

- [ ] **步骤 4：运行测试与 commit**

```bash
git add app/web/src/components/modal/settingModal/settingModal.tsx app/web/src/components/modal/settingModal/settingModal.test.tsx
git commit -m "fix(mobile): 设置弹窗补安全区内缩并统一 dvh"
```

### 任务 8：平台判定与房间操作入口

**文件：** `app/web/src/layouts/layout.tsx:368-373,393-398,436-489`、`app/web/src/components/room/components/roomItem.tsx:102-120,222-238`

- [ ] **步骤 1：布局平台判定改 `inMobile()`**

从 `@gospeak/mobile-capabilities` 导入 `inMobile`；`isMobile` 状态改为 `inMobile() || matchMedia("(max-width: 767px)").matches`，并在 `matchMedia` 的 `change` 回调中重算；`data-platform` 样式分支保持 CSS 侧不变。

- [ ] **步骤 2：拖拽改 Pointer Events**

把分隔条的 `onMouseDown` / `document.addEventListener("mousemove"|"mouseup")` 改为 `onPointerDown` / `onPointerMove` / `onPointerUp`，在 `onPointerDown` 中 `e.currentTarget.setPointerCapture(e.pointerId)`，`onPointerUp` 中 `releasePointerCapture`。保留 `clampSplitWidth` 计算。

- [ ] **步骤 3：房间行加可见菜单入口**

在 `roomItem` 行尾新增 `<button type="button" aria-label="更多操作" onClick={openMenu}>`（用 lucide `Ellipsis` 图标，`size-9` 触控区），复用现有 `onContextMenu` 打开的同一菜单状态；`roomItem.tsx:229` 的单接入房仅作用于行主体，不再吞掉按钮点击（按钮 `onClick` 里 `e.stopPropagation()`）。

- [ ] **步骤 4：修正注释**

把 `layout.tsx:282` 与 `manageNav.tsx` 中关于「响应式横竖排」的过时注释改为与实际实现一致的描述。

- [ ] **步骤 5：验证与 commit**

运行：`pnpm typecheck && pnpm --filter @gospeak/web test`

```bash
git add app/web/src/layouts/layout.tsx app/web/src/components/room/components/roomItem.tsx app/web/src/components/manage/manageNav.tsx
git commit -m "fix(mobile): 平台判定走 inMobile、拖拽支持触屏、房间菜单可见"
```

---

## 阶段三：性能

### 任务 9：登录页 rAF 休眠

**文件：** `app/web/src/hooks/useAuthParallax.ts` + 新建 `useAuthParallax.test.tsx`

- [ ] **步骤 1：编写失败测试**

```tsx
test("无 hover 环境不启动 rAF", () => {
	vi.stubGlobal("matchMedia", (q) => ({ matches: q.includes("hover: none") || q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
	const raf = vi.spyOn(window, "requestAnimationFrame");
	renderHook(() => useAuthParallax({ current: document.createElement("div") }));
	expect(raf).not.toHaveBeenCalled();
});
```

- [ ] **步骤 2：运行测试确认失败**

- [ ] **步骤 3：实现休眠**

effect 开头增加 `const noHover = window.matchMedia("(hover: none)").matches; if (noHover) return;`；`tick()` 在写入 CSS 变量后判断 `Math.abs(targetX-curX) < 0.001 && Math.abs(targetY-curY) < 0.001` 时把 `curX/curY` 归零并将 `raf = 0`，不再递归；`onMove` 中若 `raf === 0` 则 `raf = requestAnimationFrame(tick)` 唤醒。

- [ ] **步骤 4：运行测试与 commit**

```bash
git add app/web/src/hooks/useAuthParallax.ts app/web/src/hooks/useAuthParallax.test.tsx
git commit -m "perf(mobile): 登录视差在无 hover 设备休眠 rAF"
```

### 任务 10：房间列表虚拟化

**文件：** `app/web/src/components/room/roomList.tsx:220-236`、`app/web/src/components/room/components/roomItem.tsx:269-275`、`app/web/src/components/common/avatar.tsx:64-70`

- [ ] **步骤 1：成员默认折叠**

`roomItem` 中 `room.members.map(...)` 改为仅在 `expanded` 为 true 时渲染；行尾加成员计数按钮 `{room.members.length}` 用于展开/收起。默认 `expanded = false`。

- [ ] **步骤 2：虚拟化房间列表**

用 `useVirtualizer`（`@tanstack/react-virtual`）包装房间列表容器：`count = rooms.length`，`estimateSize = () => 72`，`getScrollElement = () => scrollRef.current`；绝对定位渲染 `virtualItems`，每项取 `rooms[index]` 传给 `RoomItem`。保留原 `onDoubleClick` / 「…」菜单与 `room:updated` 后的滚动位置。

- [ ] **步骤 3：头像懒加载**

`avatar.tsx` 的 `<img>` 增加 `loading="lazy" decoding="async"`。

- [ ] **步骤 4：验证与 commit**

运行：`pnpm typecheck && pnpm --filter @gospeak/web test -- roomList`

```bash
git add app/web/src/components/room/roomList.tsx app/web/src/components/room/components/roomItem.tsx app/web/src/components/common/avatar.tsx
git commit -m "perf(mobile): 房间列表虚拟化、成员折叠与头像懒加载"
```

### 任务 11：Markdown 解析缓存

**文件：** 创建 `app/web/src/utils/markdownCache.ts`（+ `.test.ts`）、修改 `MarkdownText.tsx`、`MessageItem.tsx`

- [ ] **步骤 1：编写失败测试**

```ts
test("相同文本复用解析结果", () => {
	const a = renderMarkdownCached("**hi**", "me");
	const b = renderMarkdownCached("**hi**", "me");
	expect(a).toBe(b);
});
```

- [ ] **步骤 2：运行测试确认失败**

- [ ] **步骤 3：实现 LRU 缓存**

`markdownCache.ts` 导出 `renderMarkdownCached(text, selfName): string`，内部用 `Map` 缓存，key 为 `selfName` 与 `text` 以 NUL 字符拼接；命中则删除后重插（LRU），未命中则执行现有 marked → DOMPurify → DOMParser → TreeWalker 流程；超过 200 条时删除最早插入项。导出 `clearMarkdownCache()` 供测试。

- [ ] **步骤 4：memo 组件**

`MarkdownText` 与 `MessageItem` 用 `React.memo` 包裹；`MessageItem` 的 props 只传 `text`、`selfName` 及渲染所需原始字段，不传整个 `user` 对象。

- [ ] **步骤 5：运行测试与 commit**

```bash
git add app/web/src/utils/markdownCache.ts app/web/src/utils/markdownCache.test.ts app/web/src/components/textRoom/MarkdownText.tsx app/web/src/components/textRoom/MessageItem.tsx
git commit -m "perf(mobile): 消息 Markdown 解析加 LRU 缓存并 memo"
```

### 任务 12：store 订阅收敛

**文件：** `app/web/src/stores/socketStore.ts:690-694`、`app/web/src/components/userBar.tsx:32`、`app/web/src/components/chat/chatWindow.tsx:35-50`

- [ ] **步骤 1：socketStore 只监听域变化**

把 `useDomainStore.subscribe(() => { if (connected) listRooms() })` 改为对比 prev/next 的 `currentDomainUUID`：仅当 `next.currentDomainUUID !== prev.currentDomainUUID` 时调用 `listRooms()`。

- [ ] **步骤 2：userBar selector**

`const data = useVoiceChatStore()` 改为分别 `useVoiceChatStore((s) => s.outputVolume)` 等四个 selector（或用 `useShallow` 一次取四字段），消除全量订阅。

- [ ] **步骤 3：chatWindow selector + useMemo**

`const messages = useChatStore((s) => s.pmMessages[active] ?? [])`；`const rows = useMemo(() => buildRows(messages), [messages])`。

- [ ] **步骤 4：验证与 commit**

运行：`pnpm typecheck && pnpm --filter @gospeak/web test`

```bash
git add app/web/src/stores/socketStore.ts app/web/src/components/userBar.tsx app/web/src/components/chat/chatWindow.tsx
git commit -m "perf(mobile): 收敛 socketStore/userBar/chatWindow 的 store 订阅"
```

### 任务 13：MessageList O(1) 查找

**文件：** `app/web/src/components/textRoom/MessageList.tsx:56-84`

- [ ] **步骤 1：构建 uuid Map**

在 `useMemo` 中 `const byUuid = new Map(messages.map((m) => [m.uuid, m]))`；递归 `append` 中把 `all.find((m) => m.uuid === parent)` 改为 `byUuid.get(parent)`。

- [ ] **步骤 2：rows 用 useMemo**

把 `buildRows(...)` 的结果包进 `useMemo`，依赖为 `messages` 与线程视图开关。

- [ ] **步骤 3：验证与 commit**

运行：`pnpm --filter @gospeak/web test -- MessageList && pnpm typecheck`

```bash
git add app/web/src/components/textRoom/MessageList.tsx
git commit -m "perf(mobile): 消息线程查找改 Map 并缓存 rows"
```

### 任务 14：useCoarsePointer 提升到列表级

**文件：** `app/web/src/components/textRoom/MessageList.tsx`、`app/web/src/components/textRoom/MessageItem.tsx:34`

- [ ] **步骤 1：列表级调用**

`MessageList` 中调用 `const coarse = useCoarsePointer()`，通过 `coarse` prop 传给每个 `MessageItem`。

- [ ] **步骤 2：移除行内调用**

`MessageItem` 删除 `useCoarsePointer()` 调用，改用 prop；如该 prop 被 `MarkdownText` 使用则继续下传。

- [ ] **步骤 3：验证与 commit**

运行：`pnpm typecheck && pnpm --filter @gospeak/web test -- MessageItem`

```bash
git add app/web/src/components/textRoom/MessageList.tsx app/web/src/components/textRoom/MessageItem.tsx
git commit -m "perf(mobile): coarse pointer 媒体查询提升到消息列表级"
```

---

## 最终验证（所有任务完成后执行一次）

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build:mobile
node scripts/check-mobile-bridge.mjs
node scripts/mobile-bind-proxyrules.mjs --surface-only
```

预期：全绿。原生编译由手动 workflow `build-mobile.yml` 的 `assembleDebug` 承担（本机无 Android SDK / Xcode）；iOS 改动用 `swiftc -typecheck` 做本地兜底。

## 自检

- **规格覆盖度**：14 项任务逐一对应规格 §3（任务 1-4）、§4（任务 5-8）、§5（任务 9-14），无遗漏
- **占位符扫描**：无 TODO / 待定；每个代码步骤均给出可执行片段或明确修改位置
- **类型一致性**：`refresh()`、`navigateByPath`、`reportPushToken`、`renderMarkdownCached` 在定义任务与使用任务中签名一致
