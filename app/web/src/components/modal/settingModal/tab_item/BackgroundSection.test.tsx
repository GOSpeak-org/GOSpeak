import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBackground: vi.fn(),
	putBackground: vi.fn(),
	deleteBackground: vi.fn(),
	compressImage: vi.fn(),
	toastActionError: vi.fn((_error: unknown, fallback: string) => fallback),
}));

vi.mock("@/utils/backgroundDb", () => ({
	getBackground: mocks.getBackground,
	putBackground: mocks.putBackground,
	deleteBackground: mocks.deleteBackground,
}));
vi.mock("@/utils/backgroundImage", () => ({
	compressImage: mocks.compressImage,
}));
vi.mock("@/utils/toast", () => ({
	toastActionError: mocks.toastActionError,
}));

import BackgroundSection from "./BackgroundSection";
import {
	createBackgroundStore,
	useBackgroundStore,
} from "@/stores/backgroundStore";
import { useThemeStore } from "@/stores/themeStore";

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	URL.createObjectURL = vi.fn(() => "blob:mock-preview");
	URL.revokeObjectURL = vi.fn();
	document.documentElement.className = "";
	document.documentElement.removeAttribute("data-bg-tier");
	document.body.style.backgroundImage = "";
	useThemeStore.setState({ isDark: false });
	createBackgroundStore();
});

afterEach(() => {
	cleanup();
});

describe("BackgroundSection", () => {
	it("shows the upload placeholder and disables tiers without an image", () => {
		render(<BackgroundSection />);
		expect(screen.getByText("上传背景图")).toBeTruthy();
		expect(screen.getByText("均衡").closest("button")?.disabled).toBe(true);
		expect(screen.queryByText("更换")).toBeNull();
	});

	it("shows preview with actions once an image is set", () => {
		useBackgroundStore.setState({ hasLight: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		expect(screen.getByAltText("背景图预览")).toBeTruthy();
		expect(screen.getByText("更换")).toBeTruthy();
		expect(screen.getByText("删除")).toBeTruthy();
		expect(screen.getByText("均衡").closest("button")?.disabled).toBe(false);
	});

	it("removes the image via the store", async () => {
		useBackgroundStore.setState({ hasLight: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		fireEvent.click(screen.getByText("删除"));
		await waitFor(() =>
			expect(mocks.deleteBackground).toHaveBeenCalledWith("light"),
		);
		await waitFor(() => expect(screen.getByText("上传背景图")).toBeTruthy());
	});

	it("persists the selected tier for the current mode", () => {
		useBackgroundStore.setState({ hasLight: true, activeUrl: "blob:preview" });
		render(<BackgroundSection />);
		fireEvent.click(screen.getByText("沉浸"));
		expect(localStorage.getItem("background-tier-light")).toBe("immersive");
	});

	it("follows the dark mode for mode-specific state", () => {
		useThemeStore.setState({ isDark: true });
		useBackgroundStore.setState({ hasDark: true, activeUrl: "blob:dark" });
		render(<BackgroundSection />);
		expect(screen.getByText("深色")).toBeTruthy();
		fireEvent.click(screen.getByText("删除"));
		expect(mocks.deleteBackground).toHaveBeenCalledWith("dark");
	});

	it("disables the section when the environment is unsupported", () => {
		useBackgroundStore.setState({ available: false });
		render(<BackgroundSection />);
		expect(
			screen.getByText("当前环境不支持存储背景图，功能已停用。"),
		).toBeTruthy();
		expect(screen.queryByText("上传背景图")).toBeNull();
	});
});
