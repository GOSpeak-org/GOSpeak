/**
 * Capacitor 插件访问层。
 *
 * 与 @gospeak/desktop 的 bridge.ts 对应：Capacitor 插件以
 * registerPlugin("<Name>") 取得代理，方法名必须与原生侧
 * @CapacitorPlugin(name = ...) + @PluginMethod 逐字一致。
 * 方法名拼错时运行期只会得到 "not implemented"，多数能力会静默吞掉，
 * 因此由 scripts/check-mobile-bridge.mjs 在 CI 拦截。
 *
 * @capacitor/core 只在原生分支动态加载，web / desktop 构建里整段被折叠剔除。
 */

export function pluginMethod(plugin: string, method: string): string {
	return `${plugin}.${method}`;
}

interface PluginProxy {
	addListener?(
		event: string,
		handler: (payload: unknown) => void,
	): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

export async function getPlugin<T extends object>(name: string): Promise<T> {
	if (!__GOSPEAK_MOBILE__) {
		throw new Error(
			`[gospeak/mobile] 插件 "${name}" 需要移动端运行时（当前不是 mobile 构建）。`,
		);
	}
	const { registerPlugin } = await import("@capacitor/core");
	return registerPlugin<T>(name);
}

export async function listenPlugin<T>(
	name: string,
	event: string,
	handler: (payload: T) => void,
): Promise<() => void> {
	if (!__GOSPEAK_MOBILE__) return () => {};
	const plugin = await getPlugin<PluginProxy>(name);
	if (typeof plugin.addListener !== "function") return () => {};
	const handle = await plugin.addListener(event, (payload) =>
		handler(payload as T),
	);
	return () => {
		void handle.remove();
	};
}
