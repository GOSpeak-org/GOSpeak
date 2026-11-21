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

import { useThemeStore } from "./themeStore";
import {
	backgroundStore,
	createBackgroundStore,
	useBackgroundStore,
} from "./backgroundStore";

const lightBlob = new Blob(["light"], { type: "image/webp" });
const darkBlob = new Blob(["dark"], { type: "image/webp" });
const compressedBlob = new Blob(["compressed"], { type: "image/webp" });

const blobStore = new Map<string, Blob>();
let urlCounter = 0;

beforeEach(() => {
	urlCounter = 0;
	localStorage.clear();
	// jsdom 不带 indexedDB；db 模块已 mock，这里只要让存在性检查通过
	vi.stubGlobal("indexedDB", { open: vi.fn() });
	vi.clearAllMocks();
	blobStore.clear();
	mocks.getBackground.mockImplementation(
		async (mode: string) => blobStore.get(mode) ?? null,
	);
	mocks.putBackground.mockImplementation(async (mode: string, blob: Blob) => {
		blobStore.set(mode, blob);
	});
	mocks.deleteBackground.mockImplementation(async (mode: string) => {
		blobStore.delete(mode);
	});
	URL.createObjectURL = vi.fn(() => `blob:mock-${urlCounter++}`);
	URL.revokeObjectURL = vi.fn();
	document.documentElement.className = "";
	document.documentElement.removeAttribute("data-bg-tier");
	document.body.style.backgroundImage = "";
	useThemeStore.setState({ isDark: false });
	createBackgroundStore();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("backgroundStore", () => {
	it("init loads both modes and applies the light background", async () => {
		blobStore.set("light", lightBlob);
		blobStore.set("dark", darkBlob);
		await backgroundStore.init();
		const state = useBackgroundStore.getState();
		expect(state.hasLight).toBe(true);
		expect(state.hasDark).toBe(true);
		expect(state.activeUrl).toBe("blob:mock-0");
		expect(document.documentElement.classList.contains("bg-custom")).toBe(true);
		expect(document.documentElement.getAttribute("data-bg-tier")).toBe(
			"balanced",
		);
		expect(document.body.style.backgroundImage).toBe('url("blob:mock-0")');
	});

	it("init marks the feature unavailable when IndexedDB fails", async () => {
		mocks.getBackground.mockRejectedValue(new Error("boom"));
		await backgroundStore.init();
		expect(useBackgroundStore.getState().available).toBe(false);
		expect(document.documentElement.classList.contains("bg-custom")).toBe(
			false,
		);
	});

	it("switching dark mode refreshes the active image and revokes the old URL", async () => {
		blobStore.set("light", lightBlob);
		blobStore.set("dark", darkBlob);
		await backgroundStore.init();
		expect(useBackgroundStore.getState().activeUrl).toBe("blob:mock-0");
		useThemeStore.setState({ isDark: true });
		await vi.waitFor(() => {
			expect(useBackgroundStore.getState().activeUrl).toBe("blob:mock-1");
		});
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
	});

	it("setImage compresses, stores and refreshes", async () => {
		mocks.compressImage.mockResolvedValue(compressedBlob);
		const file = new File(["raw"], "bg.png", { type: "image/png" });
		await backgroundStore.setImage("light", file);
		expect(mocks.compressImage).toHaveBeenCalledWith(file);
		expect(blobStore.get("light")).toBe(compressedBlob);
		expect(useBackgroundStore.getState().hasLight).toBe(true);
		expect(useBackgroundStore.getState().activeUrl).toBe("blob:mock-0");
	});

	it("setImage rejects non-image files without storing", async () => {
		const file = new File(["x"], "notes.txt", { type: "text/plain" });
		await backgroundStore.setImage("light", file);
		expect(mocks.compressImage).not.toHaveBeenCalled();
		expect(mocks.toastActionError).toHaveBeenCalled();
		expect(blobStore.has("light")).toBe(false);
	});

	it("setImage surfaces compression failures via toast", async () => {
		mocks.compressImage.mockRejectedValue(new Error("ENCODE_FAILED"));
		const file = new File(["raw"], "bg.png", { type: "image/png" });
		await backgroundStore.setImage("dark", file);
		expect(mocks.putBackground).not.toHaveBeenCalled();
		expect(mocks.toastActionError).toHaveBeenCalled();
	});

	it("removeImage clears storage and DOM state", async () => {
		blobStore.set("dark", darkBlob);
		useThemeStore.setState({ isDark: true });
		await backgroundStore.init();
		expect(useBackgroundStore.getState().activeUrl).not.toBeNull();
		await backgroundStore.removeImage("dark");
		expect(useBackgroundStore.getState().hasDark).toBe(false);
		expect(useBackgroundStore.getState().activeUrl).toBeNull();
		expect(document.documentElement.classList.contains("bg-custom")).toBe(
			false,
		);
		expect(document.body.style.backgroundImage).toBe("");
	});

	it("setTier persists per mode and updates the DOM attribute", async () => {
		blobStore.set("dark", darkBlob);
		useThemeStore.setState({ isDark: true });
		await backgroundStore.init();
		backgroundStore.setTier("dark", "immersive");
		expect(localStorage.getItem("background-tier-dark")).toBe("immersive");
		expect(useBackgroundStore.getState().darkTier).toBe("immersive");
		expect(document.documentElement.getAttribute("data-bg-tier")).toBe(
			"immersive",
		);
		expect(useBackgroundStore.getState().lightTier).toBe("balanced");
	});
});
