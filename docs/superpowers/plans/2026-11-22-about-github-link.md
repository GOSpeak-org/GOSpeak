# 关于页 GitHub 项目地址入口 实现计划

> 面向 AI 代理的工作者：必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框语法来跟踪进度。

**目标：** 在「设置 → 关于」页的版本卡片加一行「项目地址」，点击后在浏览器新标签或桌面系统浏览器打开 https://github.com/NoelOrin/GOSpeak 。

**架构：** 新增通用桌面能力 Browser.OpenExternal（Go 宿主绑定 + TS SDK native/fallback），关于页在桌面模式走桥接、Web 模式保留 a target=_blank 默认行为。

**技术栈：** Go 1.27 / MyGo 桥接 · React 19 / TypeScript · Vitest · Biome。

---

### 任务 1：桌面宿主新增 Browser.OpenExternal 绑定

**文件：** 创建 app/desktop/browser.go、app/desktop/browser_test.go；修改 app/desktop/main.go 绑定列表末尾。

- [ ] 步骤 1：编写失败测试（app/desktop/browser_test.go）
~~~go
package main

import (
	"context"
	"testing"
)

func TestBrowserOpenExternalRejectsNonHTTP(t *testing.T) {
	for _, raw := range []string{"file:///etc/passwd", "javascript:alert(1)", "not-a-url", "https://"} {
		if err := (Browser{}).OpenExternal(context.Background(), raw); err == nil {
			t.Fatalf("expected error for %q", raw)
		}
	}
}
~~~
- [ ] 步骤 2：运行 cd app/desktop && go test ./... -run TestBrowserOpenExternal -count=1，预期 FAIL（Browser 未定义）。
- [ ] 步骤 3：编写最少实现（app/desktop/browser.go）
~~~go
package main

import (
	"context"
	"fmt"
	"net/url"
)

// Browser opens links in the system browser from the embedded webview.
type Browser struct{}

// OpenExternal opens an http(s) URL with the platform's default browser.
func (Browser) OpenExternal(ctx context.Context, rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("invalid external URL %q", rawURL)
	}
	return openInBrowser(u.String())
}
~~~
并在 main.go 绑定列表末尾加 mygo.Bind(Browser{})。
- [ ] 步骤 4：运行 go test ./... -run TestBrowserOpenExternal -count=1 && go build ./...，预期 PASS。
- [ ] 步骤 5：git add app/desktop/browser.go app/desktop/browser_test.go app/desktop/main.go && git commit -m "feat(desktop): add Browser.OpenExternal bridge command"。

### 任务 2：SDK 新增 browser 能力

**文件：** 创建 packages/desktop/src/capabilities/browser.ts 与 browser.test.ts；修改 packages/desktop/src/index.ts 导出 createBrowser / Browser 类型。

- [ ] 步骤 1：编写失败测试（browser.test.ts）
~~~ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowser } from "./browser";

afterEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
});

describe("createBrowser 浏览器降级", () => {
	it("调用 window.open 在新标签打开外链", async () => {
		const open = vi.fn();
		(globalThis as unknown as { window: unknown }).window = { open };
		await createBrowser().openExternal("https://example.com");
		expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
	});
	it("window 不存在时不抛异常", async () => {
		await expect(createBrowser().openExternal("https://example.com")).resolves.toBeUndefined();
	});
});
~~~
- [ ] 步骤 2：运行 pnpm --filter @gospeak/desktop test -- browser.test.ts，预期 FAIL（模块不存在）。
- [ ] 步骤 3：编写最少实现（browser.ts）
~~~ts
import { bridge, command } from "../bridge";
import { isDesktop } from "../runtime";

export interface Browser {
	openExternal(url: string): Promise<void>;
}

export function createBrowser(): Browser {
	return {
		openExternal(url: string): Promise<void> {
			if (isDesktop()) {
				return bridge.invoke<void>(command("Browser", "OpenExternal"), url);
			}
			if (typeof window !== "undefined") {
				window.open(url, "_blank", "noopener,noreferrer");
			}
			return Promise.resolve();
		},
	};
}
~~~
index.ts 能力导出区加：export { createBrowser, type Browser } from "./capabilities/browser";
- [ ] 步骤 4：运行 pnpm --filter @gospeak/desktop test -- browser.test.ts && node scripts/check-desktop-commands.mjs，预期 PASS 且 Browser.OpenExternal 不在 missing。
- [ ] 步骤 5：git add packages/desktop/src/capabilities/browser.ts packages/desktop/src/capabilities/browser.test.ts packages/desktop/src/index.ts && git commit -m "feat(desktop): add browser openExternal capability"。

### 任务 3：关于页渲染项目地址链接

**文件：** 修改 app/web/src/components/modal/settingModal/tab_item/about.tsx（import、版本卡片）与 about.test.tsx（mock、测试）。

- [ ] 步骤 1：编写失败测试：mocks 加 openExternal: vi.fn(() => Promise.resolve())，vi.mock 加 createBrowser: () => ({ openExternal: mocks.openExternal })，并新增两个用例：桌面端渲染 link 名为 GitHub ↗、href 为 https://github.com/NoelOrin/GOSpeak，点击后 openExternal 被调用；Web 端点击不调用 openExternal。
- [ ] 步骤 2：运行 pnpm --filter @gospeak/web test -- about.test.tsx，预期 FAIL（找不到 link）。
- [ ] 步骤 3：最少实现：import 加 createBrowser；组件内 const browser = createBrowser()；模块级常量 REPO_URL = "https://github.com/NoelOrin/GOSpeak"；版本卡片在「运行环境」行后加：
~~~tsx
<div className="flex items-center justify-between gap-4">
	<span className="text-muted-foreground text-xs">项目地址</span>
	<a href={REPO_URL} target="_blank" rel="noreferrer" className="text-primary text-xs hover:underline" onClick={(e) => { if (!inDesktop()) return; e.preventDefault(); void browser.openExternal(REPO_URL); }}>
		GitHub ↗
	</a>
</div>
~~~
- [ ] 步骤 4：运行 pnpm --filter @gospeak/web test -- about.test.tsx、pnpm --filter @gospeak/web typecheck、pnpm --filter @gospeak/web build:desktop、node scripts/check-desktop-commands.mjs，预期全部 PASS。
- [ ] 步骤 5：git add app/web/src/components/modal/settingModal/tab_item/about.tsx app/web/src/components/modal/settingModal/tab_item/about.test.tsx && git commit -m "feat(web): add GitHub project link on About page"。
