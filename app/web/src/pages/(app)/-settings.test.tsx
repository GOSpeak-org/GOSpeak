import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	navigate: vi.fn(),
	logout: vi.fn(async () => {}),
	clearSession: vi.fn(async () => {}),
	fieldProps: null as null | { onBeforeSwitch?: () => void | Promise<void> },
	user: null as null | { display_name: string; name: string; role: string },
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: Record<string, unknown>) => opts,
	useNavigate: () => h.navigate,
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createServerConfig: () => ({
		getBaseUrlSync: () => "",
		getBaseUrl: async () => "",
		setBaseUrl: async () => {},
	}),
}));

vi.mock("@gospeak/desktop", () => ({
	inDesktop: () => false,
	createServerConfig: () => ({
		getBaseUrlSync: () => "",
		getBaseUrl: async () => "",
		setBaseUrl: async () => {},
	}),
}));

vi.mock("@/components/common/serverUrlField", () => ({
	default: (props: { onBeforeSwitch?: () => void | Promise<void> }) => {
		h.fieldProps = props;
		return <div>服务器地址输入框</div>;
	},
}));

vi.mock("@/components/mobile/serverSwitch", () => ({
	clearSessionForServerSwitch: () => h.clearSession(),
}));

vi.mock("@/stores/userStore", () => ({
	useUserStore: Object.assign(
		(
			selector: (s: {
				user: typeof h.user;
				logout: () => Promise<void>;
			}) => unknown,
		) => selector({ user: h.user, logout: h.logout }),
		{ getState: () => ({ user: h.user, logout: h.logout }) },
	),
}));

import SettingsPage from "@/components/mobile/settingsPage";

afterEach(cleanup);

describe("移动端设置页", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.fieldProps = null;
		h.user = { display_name: "阿明", name: "amin", role: "admin" };
	});

	it("渲染服务器地址区块与账号信息", () => {
		render(<SettingsPage />);
		expect(screen.getByText("设置", { selector: "h1" })).toBeTruthy();
		expect(screen.getByText("服务器地址输入框")).toBeTruthy();
		expect(screen.getByText("阿明")).toBeTruthy();
		expect(screen.getByText("admin")).toBeTruthy();
	});

	it("退出登录清会话并回到登录页", async () => {
		render(<SettingsPage />);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
		});
		expect(h.logout).toHaveBeenCalled();
		expect(h.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
	});

	it("传给服务器地址组件的回调会清理会话", async () => {
		render(<SettingsPage />);
		expect(h.fieldProps?.onBeforeSwitch).toBeTypeOf("function");
		await h.fieldProps?.onBeforeSwitch?.();
		expect(h.clearSession).toHaveBeenCalled();
	});
});
