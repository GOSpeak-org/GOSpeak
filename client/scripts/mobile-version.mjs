#!/usr/bin/env node
// 移动端版本号同步：把 .github/versions/mobile.yaml 的声明写入原生工程。
//
// 单一事实源是仓库根 .github/versions/mobile.yaml；以下都是它的派生副本，
// 由本脚本统一写入，scripts/release/check-version.mjs 负责校验漂移：
//   client/mobile/package.json
//   client/mobile/android/app/build.gradle          （versionName + versionCode）
//   client/mobile/ios/App/App.xcodeproj/project.pbxproj
//                                                   （MARKETING_VERSION + CURRENT_PROJECT_VERSION）
//
// 用法：node client/scripts/mobile-version.mjs [rootDir] [--check]
//   rootDir    可选；缺省从 process.cwd() 逐级向上找仓库根
//              （同时含 .github/versions 与 pnpm-workspace.yaml 的目录）
//   --check    只比对不写入：副本与声明不一致时打印带路径的差异并退出 1
//
// 注意：monorepo 下仓库根是 GOSpeak/，不是 client/。旧实现默认取脚本所在目录的
// 上一级（client/），会去找 client/.github/versions/mobile.yaml 而 ENOENT，
// 故改为向上探测仓库根，路径统一带上 client/ 前缀。
// web 端版本由 .github/versions/web.yaml 独立管理：本脚本不写 client/web 下任何文件。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

/** 1.0.3 -> 10003，保证 versionCode 随 semver 单调递增。 */
export function androidVersionCode(version) {
	const match = SEMVER.exec(String(version).trim());
	if (!match) throw new Error(`invalid SemVer for versionCode: ${version}`);
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	return major * 10000 + minor * 100 + patch;
}

/** 从 start 逐级向上找同时含 .github/versions 与 pnpm-workspace.yaml 的仓库根。 */
export function findRepoRoot(start) {
	let dir = resolve(start);
	for (;;) {
		if (
			existsSync(join(dir, ".github", "versions", "mobile.yaml")) &&
			existsSync(join(dir, "pnpm-workspace.yaml"))
		) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function readDeclared(rootDir) {
	const path = join(rootDir, ".github", "versions", "mobile.yaml");
	const raw = readFileSync(path, "utf8");
	const match = raw.match(/^version:\s*["']?([^\s#"']+)["']?\s*(?:#.*)?$/m);
	if (!match) {
		throw new Error(`${path}: must declare a top-level "version:" field`);
	}
	return match[1];
}

/** 每个派生副本的替换规则。 */
function transformsFor(version, code) {
	return [
		{
			relPath: "client/mobile/package.json",
			patterns: [[/("version":\s*)"[^"]*"/g, `$1"${version}"`]],
		},
		{
			relPath: "client/mobile/android/app/build.gradle",
			patterns: [
				[/versionCode\s+\d+/g, `versionCode ${code}`],
				[/versionName\s+"[^"]*"/g, `versionName "${version}"`],
			],
		},
		{
			relPath: "client/mobile/ios/App/App.xcodeproj/project.pbxproj",
			patterns: [
				[/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
				[
					/CURRENT_PROJECT_VERSION = [^;]+;/g,
					`CURRENT_PROJECT_VERSION = ${code};`,
				],
			],
		},
	];
}

function plan(rootDir, version) {
	const code = androidVersionCode(version);
	const changes = [];
	const missing = [];
	for (const entry of transformsFor(version, code)) {
		const abs = join(rootDir, entry.relPath);
		if (!existsSync(abs)) {
			missing.push(entry.relPath);
			continue;
		}
		const before = readFileSync(abs, "utf8");
		let after = before;
		for (const [pattern, replacement] of entry.patterns) {
			after = after.replace(pattern, replacement);
		}
		if (after !== before) changes.push({ relPath: entry.relPath, after });
	}
	return { version, code, changes, missing };
}

/** 把声明版本写入所有派生副本（保持原有导出与返回值）。 */
export function syncMobileVersion(rootDir) {
	const { version, code, changes } = plan(rootDir, readDeclared(rootDir));
	for (const change of changes) {
		writeFileSync(join(rootDir, change.relPath), change.after);
	}
	return { version, code };
}

/** 只比对不写入：返回漂移的副本路径列表与缺失文件列表。 */
export function checkMobileVersion(rootDir) {
	const version = readDeclared(rootDir);
	const { code, changes, missing } = plan(rootDir, version);
	return {
		version,
		code,
		drifted: changes.map((change) => change.relPath),
		missing,
	};
}

function main() {
	const args = process.argv.slice(2);
	const checkOnly = args.includes("--check");
	const positional = args.filter((arg) => arg !== "--check");
	const root =
		positional[0] === undefined
			? findRepoRoot(process.cwd())
			: resolve(positional[0]);
	if (!root) {
		throw new Error(
			"repository root not found: no ancestor contains .github/versions/mobile.yaml and pnpm-workspace.yaml; pass rootDir explicitly",
		);
	}

	if (checkOnly) {
		const { version, code, drifted, missing } = checkMobileVersion(root);
		if (drifted.length === 0 && missing.length === 0) {
			console.log(
				"mobile version check ok: " +
					version +
					" (android versionCode " +
					code +
					")",
			);
			return;
		}
		for (const relPath of drifted) {
			console.error(
				"::error::" +
					relPath +
					': version drift, expected "' +
					version +
					'" / versionCode ' +
					code,
			);
		}
		for (const relPath of missing) {
			console.error(`::error::${relPath}: file not found`);
		}
		process.exitCode = 1;
		return;
	}

	const { version, code } = syncMobileVersion(root);
	console.log(
		`mobile version synced: ${version} (android versionCode ${code})`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	try {
		main();
	} catch (err) {
		console.error(`::error::${err instanceof Error ? err.message : err}`);
		process.exitCode = 1;
	}
}
