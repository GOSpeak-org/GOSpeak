#!/usr/bin/env node
// 校验移动桥接契约：TS 侧 pluginMethod("Plugin", "method") 必须与原生侧
// 插件名 + 方法名逐字一致（iOS jsName/CAPPluginMethod、Android @CapacitorPlugin/@PluginMethod）。
// 拼错时运行期只会得到 "not implemented"，多数能力会静默吞掉，因此在 CI 拦截。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TS_DIR = "packages/mobile-capabilities/src/capabilities";
const IOS_DIR = "app/mobile/ios/App/App";
const ANDROID_DIR = "app/mobile/android/app/src/main/java/dev/gospeak/mobile";

export function extractTsMethods(files) {
	const methods = new Set();
	for (const file of files) {
		for (const m of file.source.matchAll(
			/pluginMethod\(\s*"([A-Z]\w*)"\s*,\s*"([A-Za-z]\w*)"\s*\)/g,
		)) {
			methods.add(`${m[1]}.${m[2]}`);
		}

		const pluginNames = [
			...file.source.matchAll(/getPlugin<[^>]*>\(\s*"([A-Z]\w*)"/g),
		].map((m) => m[1]);
		for (const plugin of pluginNames) {
			// 直接调用：plugin.list() / plugin.set(...)
			for (const m of file.source.matchAll(/\bplugin\.([A-Za-z]\w*)\s*\(/g)) {
				methods.add(`${plugin}.${m[1]}`);
			}
			// 动态调用：const call = async (method: "activate" | "deactivate")
			for (const m of file.source.matchAll(
				/method:\s*"([A-Za-z]\w*)"\s*\|\s*"([A-Za-z]\w*)"/g,
			)) {
				methods.add(`${plugin}.${m[1]}`);
				methods.add(`${plugin}.${m[2]}`);
			}
		}
	}
	return methods;
}

export function extractSwiftMethods(files) {
	const methods = new Set();
	for (const file of files) {
		const nameMatch = file.source.match(/jsName\s*=\s*"([A-Z]\w*)"/);
		if (!nameMatch) continue;
		const plugin = nameMatch[1];
		for (const m of file.source.matchAll(
			/CAPPluginMethod\(\s*name:\s*"([A-Za-z]\w*)"/g,
		)) {
			methods.add(`${plugin}.${m[1]}`);
		}
	}
	return methods;
}

export function extractKotlinMethods(files) {
	const methods = new Set();
	for (const file of files) {
		const nameMatch = file.source.match(
			/@CapacitorPlugin\(\s*name\s*=\s*"([A-Z]\w*)"/,
		);
		if (!nameMatch) continue;
		const plugin = nameMatch[1];
		for (const m of file.source.matchAll(
			/@PluginMethod\s*(?:\r?\n\s*)*fun\s+([A-Za-z]\w*)\s*\(/g,
		)) {
			methods.add(`${plugin}.${m[1]}`);
		}
	}
	return methods;
}

export function extractJavaMethods(files) {
	const methods = new Set();
	for (const file of files) {
		const nameMatch = file.source.match(
			/@CapacitorPlugin\(\s*name\s*=\s*"([A-Z]\w*)"/,
		);
		if (!nameMatch) continue;
		const plugin = nameMatch[1];
		for (const m of file.source.matchAll(
			/@PluginMethod\s*(?:\r?\n\s*)*(?:public\s+)?(?:static\s+)?void\s+([A-Za-z]\w*)\s*\(/g,
		)) {
			methods.add(`${plugin}.${m[1]}`);
		}
	}
	return methods;
}

export function checkMethods({ ts, native }) {
	const missing = [...ts].filter((m) => !native.has(m)).sort();
	const unused = [...native].filter((m) => !ts.has(m)).sort();
	return { missing, unused, ok: missing.length === 0 };
}

function readDir(dir, extensions) {
	try {
		return readdirSync(dir)
			.filter((f) => extensions.some((ext) => f.endsWith(ext)))
			.map((f) => ({
				path: join(dir, f),
				source: readFileSync(join(dir, f), "utf8"),
			}));
	} catch {
		return [];
	}
}

const CUSTOM_PLUGINS = new Set(["AudioSession", "MediaControl"]);

export function checkRepo(root = ".") {
	const ts = new Set(
		[...extractTsMethods(readDir(join(root, TS_DIR), [".ts"]))].filter((m) =>
			CUSTOM_PLUGINS.has(m.split(".")[0]),
		),
	);
	const native = new Set([
		...extractSwiftMethods(readDir(join(root, IOS_DIR), [".swift"])),
		...extractKotlinMethods(readDir(join(root, ANDROID_DIR), [".kt"])),
		...extractJavaMethods(readDir(join(root, ANDROID_DIR), [".java"])),
	]);
	return { ts, native, ...checkMethods({ ts, native }) };
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { missing, unused } = checkRepo(".");
	for (const m of unused) {
		console.warn(`::warning::原生实现了但 TS 未调用: ${m}`);
	}
	for (const m of missing) {
		console.error(`::error::TS 调用了原生未实现的方法: ${m}`);
	}
	if (missing.length > 0) process.exit(1);
	console.log("mobile bridge methods are in sync");
}
