import { create } from "zustand";
import { useThemeStore } from "@/stores/themeStore";
import {
	deleteBackground,
	getBackground,
	putBackground,
	type BackgroundMode,
} from "@/utils/backgroundDb";
import { compressImage } from "@/utils/backgroundImage";
import { toastActionError } from "@/utils/toast";

export type { BackgroundMode };

const STORAGE_TIER_LIGHT = "background-tier-light";
const STORAGE_TIER_DARK = "background-tier-dark";

export type BackgroundTier = "subtle" | "balanced" | "immersive";

export const backgroundTiers: {
	value: BackgroundTier;
	label: string;
}[] = [
	{ value: "subtle", label: "轻透" },
	{ value: "balanced", label: "均衡" },
	{ value: "immersive", label: "沉浸" },
];

export const DEFAULT_BACKGROUND_TIER: BackgroundTier = "balanced";

function storedTier(key: string): BackgroundTier {
	const saved = localStorage.getItem(key);
	if (saved === "subtle" || saved === "balanced" || saved === "immersive") {
		return saved;
	}
	return DEFAULT_BACKGROUND_TIER;
}

interface BackgroundState {
	lightTier: BackgroundTier;
	darkTier: BackgroundTier;
	hasLight: boolean;
	hasDark: boolean;
	activeUrl: string | null;
	available: boolean;
}

export const useBackgroundStore = create<BackgroundState>(() => ({
	lightTier: storedTier(STORAGE_TIER_LIGHT),
	darkTier: storedTier(STORAGE_TIER_DARK),
	hasLight: false,
	hasDark: false,
	activeUrl: null,
	available: true,
}));

function currentMode(): BackgroundMode {
	return useThemeStore.getState().isDark ? "dark" : "light";
}

function tierStorageKey(mode: BackgroundMode): string {
	return mode === "light" ? STORAGE_TIER_LIGHT : STORAGE_TIER_DARK;
}

function clearBackgroundDom(): void {
	document.documentElement.classList.remove("bg-custom");
	document.documentElement.removeAttribute("data-bg-tier");
	const body = document.body.style;
	body.backgroundImage = "";
	body.backgroundSize = "";
	body.backgroundPosition = "";
	body.backgroundRepeat = "";
	body.backgroundAttachment = "";
}

function applyBackground(): void {
	const { activeUrl, lightTier, darkTier } = useBackgroundStore.getState();
	const isDark = useThemeStore.getState().isDark;
	const html = document.documentElement;
	const body = document.body.style;
	if (!activeUrl) {
		clearBackgroundDom();
		return;
	}
	html.classList.add("bg-custom");
	html.setAttribute("data-bg-tier", isDark ? darkTier : lightTier);
	body.backgroundImage = `url("${activeUrl}")`;
	body.backgroundSize = "cover";
	body.backgroundPosition = "center";
	body.backgroundRepeat = "no-repeat";
	body.backgroundAttachment = "fixed";
}

function setActiveBlob(blob: Blob | null): void {
	const { activeUrl } = useBackgroundStore.getState();
	if (activeUrl) URL.revokeObjectURL(activeUrl);
	useBackgroundStore.setState({
		activeUrl: blob ? URL.createObjectURL(blob) : null,
	});
	applyBackground();
}

async function refreshActiveBlob(): Promise<void> {
	if (!useBackgroundStore.getState().available) return;
	try {
		setActiveBlob(await getBackground(currentMode()));
	} catch {
		useBackgroundStore.setState({ activeUrl: null, available: false });
		clearBackgroundDom();
	}
}

let initialized = false;
let prevIsDark: boolean | null = null;

export const initBackground = async (): Promise<void> => {
	if (initialized) return;
	initialized = true;
	prevIsDark = useThemeStore.getState().isDark;
	if (typeof indexedDB === "undefined") {
		useBackgroundStore.setState({ available: false });
		return;
	}
	try {
		const [light, dark] = await Promise.all([
			getBackground("light"),
			getBackground("dark"),
		]);
		useBackgroundStore.setState({
			hasLight: light !== null,
			hasDark: dark !== null,
		});
	} catch {
		useBackgroundStore.setState({ available: false });
		return;
	}
	await refreshActiveBlob();
	useThemeStore.subscribe(() => {
		const isDark = useThemeStore.getState().isDark;
		if (isDark === prevIsDark) return;
		prevIsDark = isDark;
		void refreshActiveBlob();
	});
};

const setImage = async (mode: BackgroundMode, file: File): Promise<void> => {
	if (!useBackgroundStore.getState().available) {
		toastActionError(
			new Error("INDEXEDDB_UNAVAILABLE"),
			"当前环境不支持背景图",
		);
		return;
	}
	if (!file.type.startsWith("image/")) {
		toastActionError(new Error("IMAGE_TYPE_UNSUPPORTED"), "仅支持图片文件");
		return;
	}
	try {
		const blob = await compressImage(file);
		await putBackground(mode, blob);
		if (mode === "light") {
			useBackgroundStore.setState({ hasLight: true });
		} else {
			useBackgroundStore.setState({ hasDark: true });
		}
		await refreshActiveBlob();
	} catch (error) {
		toastActionError(error, "背景图保存失败，请重试");
	}
};

const removeImage = async (mode: BackgroundMode): Promise<void> => {
	try {
		await deleteBackground(mode);
		if (mode === "light") {
			useBackgroundStore.setState({ hasLight: false });
		} else {
			useBackgroundStore.setState({ hasDark: false });
		}
		await refreshActiveBlob();
	} catch (error) {
		toastActionError(error, "背景图删除失败，请重试");
	}
};

const setTier = (mode: BackgroundMode, tier: BackgroundTier): void => {
	localStorage.setItem(tierStorageKey(mode), tier);
	if (mode === "light") {
		useBackgroundStore.setState({ lightTier: tier });
	} else {
		useBackgroundStore.setState({ darkTier: tier });
	}
	applyBackground();
};

export const backgroundStore = {
	get state() {
		return useBackgroundStore.getState();
	},
	init: initBackground,
	setImage,
	removeImage,
	setTier,
};

export function createBackgroundStore() {
	initialized = false;
	prevIsDark = null;
	const { activeUrl } = useBackgroundStore.getState();
	if (activeUrl) URL.revokeObjectURL(activeUrl);
	clearBackgroundDom();
	useBackgroundStore.setState({
		lightTier: storedTier(STORAGE_TIER_LIGHT),
		darkTier: storedTier(STORAGE_TIER_DARK),
		hasLight: false,
		hasDark: false,
		activeUrl: null,
		available: true,
	});
	return backgroundStore;
}

export default backgroundStore;
