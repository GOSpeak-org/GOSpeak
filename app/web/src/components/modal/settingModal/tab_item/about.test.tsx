import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkRelease: vi.fn(),
	downloadRelease: vi.fn(),
	openReleasePage: vi.fn(),
	onProgress: vi.fn(() => () => {}),
	logsPath: vi.fn(() => Promise.resolve("")),
	inDesktop: vi.fn(() => true),
}));

vi.mock("@gospeak/desktop", () => ({
	inDesktop: () => mocks.inDesktop(),
	createUpdater: () => ({
		checkRelease: mocks.checkRelease,
		downloadRelease: mocks.downloadRelease,
		openReleasePage: mocks.openReleasePage,
		onProgress: mocks.onProgress,
	}),
	createClientLog: () => ({ logsPath: mocks.logsPath, revealLogs: vi.fn() }),
}));

import AboutTab from "./about";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("关于页 更新检查与下载", () => {
	beforeEach(() => {
		mocks.inDesktop.mockReturnValue(true);
		mocks.checkRelease.mockResolvedValue({
			available: true,
			version: "9.9.9",
			notes: "新版本说明",
			current: "1.1.0-rc.1",
			assetName: "gospeak-desktop-v9.9.9-darwin-arm64.dmg",
			url: "https://github.com/NoelOrin/GOSpeak/releases/download/x/y.dmg",
		});
	});

	it("桌面端检查后有新版显示下载按钮与版本说明", async () => {
		render(<AboutTab.component />);
		fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "下载更新" })).toBeTruthy();
		});
		expect(screen.getByText("9.9.9")).toBeTruthy();
		expect(screen.getByText("新版本说明")).toBeTruthy();
	});

	it("点击下载调用 downloadRelease 并展示完成文件名", async () => {
		mocks.downloadRelease.mockResolvedValue(undefined);
		render(<AboutTab.component />);
		fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
		await waitFor(() => screen.getByRole("button", { name: "下载更新" }));
		fireEvent.click(screen.getByRole("button", { name: "下载更新" }));
		await waitFor(() => {
			expect(mocks.downloadRelease).toHaveBeenCalledWith(
				"https://github.com/NoelOrin/GOSpeak/releases/download/x/y.dmg",
			);
		});
		await waitFor(() => {
			expect(screen.getByText(/已下载到 ~/)).toBeTruthy();
		});
	});

	it("已是最新版本时不显示下载按钮", async () => {
		mocks.checkRelease.mockResolvedValue({
			available: false,
			version: "1.1.0-rc.1",
			notes: "",
			current: "1.1.0-rc.1",
			assetName: "",
			url: "",
		});
		render(<AboutTab.component />);
		fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
		await waitFor(() => expect(screen.getByText("已是最新版本")).toBeTruthy());
		expect(screen.queryByRole("button", { name: "下载更新" })).toBeNull();
	});

	it("Web 环境不渲染更新区块", () => {
		mocks.inDesktop.mockReturnValue(false);
		render(<AboutTab.component />);
		expect(screen.queryByRole("button", { name: "检查更新" })).toBeNull();
	});
});
