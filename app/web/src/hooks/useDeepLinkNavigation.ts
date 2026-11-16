import { getInitialDeepLink, onDeepLink } from "@gospeak/desktop";
import { createDeepLink } from "@gospeak/mobile-capabilities";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * 把宿主收到的深链（gospeak://invite/d/CODE，宿主已归一化为 /invite/d/CODE）
 * 变成应用内跳转。桌面走 MyGo 桥接，移动端走 Capacitor App 插件。
 *
 * 冷启动时链接早于页面订阅，所以先订阅再取 Initial —— 顺序反了会丢掉启动链接。
 * 只处理应用内相对路径，避免宿主传来的任意 URL 把页面带走。
 */
export function useDeepLinkNavigation() {
	const router = useRouter();

	useEffect(() => {
		const go = (target: unknown) => {
			if (typeof target !== "string" || !target.startsWith("/")) return;
			const current = `${window.location.pathname}${window.location.search}`;
			if (current === target) return;
			void router.navigate({ to: target });
		};

		const unsubscribers: (() => void)[] = [];

		if (__GOSPEAK_DESKTOP__) {
			unsubscribers.push(onDeepLink(go));
			void getInitialDeepLink()
				.then((initial) => {
					if (initial) go(initial);
				})
				.catch(() => {});
		}

		if (__GOSPEAK_MOBILE__) {
			const deepLink = createDeepLink();
			unsubscribers.push(deepLink.onLink(go));
			void deepLink
				.initial()
				.then((initial) => {
					if (initial) go(initial);
				})
				.catch(() => {});
		}

		return () => {
			for (const off of unsubscribers) off();
		};
	}, [router]);
}
