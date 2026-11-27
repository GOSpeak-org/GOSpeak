#!/usr/bin/env node
// 四端版本一致性校验 —— 以 .github/versions/*.yaml 的显式声明为单一事实来源。
//
// 用法：node scripts/release/check-version.mjs [rootDir] [releaseTag] [component]
//   rootDir     可选，仓库根目录（默认 process.cwd()）
//   releaseTag  可选，发布 tag；tag 事件时缺省取 GITHUB_REF_NAME / RELEASE_TAG
//   component   可选，"server" | "web" | "desktop" | "mobile"；
//               缺省时按 releaseTag 前缀推断（gospeak-web-v* -> web ...）。
//               tag 与 component 都缺省时报错，避免校验了错的一端还报绿。
//
// 校验映射（根 package.json 不参与任何一端的校验）：
//   server   .github/versions/server.yaml  <- server/VERSION、server/server/package.json
//   web      .github/versions/web.yaml     <- client/web/package.json
//   desktop  .github/versions/desktop.yaml <- client/desktop/package.json、
//                                             client/desktop/mygo.config.ts 的 version
//   mobile   .github/versions/mobile.yaml  <- client/mobile/package.json、
//                                             client/mobile/android/app/build.gradle 的
//                                             versionName / versionCode、
//                                             client/mobile/ios/App/App.xcodeproj/project.pbxproj
//                                             的 MARKETING_VERSION / CURRENT_PROJECT_VERSION
//
// versionCode 与 semver 的换算只有一份实现（client/scripts/mobile-version.mjs），
// 本脚本直接 import 复用，禁止重写第二份公式；CURRENT_PROJECT_VERSION 必须等于
// androidVersionCode(declared)。
//
// 校验失败时退出码非 0，每条报错都带「文件路径 + 期望值 + 实际值」，workflow
// 直接拿 ::error:: 输出做门禁。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { androidVersionCode } from "../../client/scripts/mobile-version.mjs";
import { parseReleaseTag, tagPrefix } from "./release-naming.mjs";

const COMPONENTS = ["server", "web", "desktop", "mobile"];
const COMPONENT_ALIASES = { main: "server" };

const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const CHECKED_FILES = {
	server: ["server/VERSION", "server/server/package.json"],
	web: ["client/web/package.json"],
	desktop: ["client/desktop/package.json", "client/desktop/mygo.config.ts"],
	mobile: [
		"client/mobile/package.json",
		"client/mobile/android/app/build.gradle",
		"client/mobile/ios/App/App.xcodeproj/project.pbxproj",
	],
};

function normalizeComponent(component) {
	const value = String(component ?? "").trim();
	if (value === "") return undefined;
	const resolved = COMPONENT_ALIASES[value] ?? value;
	if (COMPONENTS.includes(resolved)) return resolved;
	throw new Error(
		"unknown component " +
			JSON.stringify(component) +
			'; expected one of "server", "web", "desktop", "mobile"',
	);
}

function declaredPathOf(component) {
	return `.github/versions/${component}.yaml`;
}

function parseVersion(value, source) {
	const version = String(value ?? "").trim();
	if (SEMVER_PATTERN.test(version)) return version;
	throw new Error(`${source} must contain a valid SemVer, got "${version}"`);
}

function readDeclaration(rootDir, declaredPath) {
	let raw;
	try {
		raw = readFileSync(resolve(rootDir, declaredPath), "utf8");
	} catch {
		throw new Error(
			declaredPath +
				': version declaration file not found (expected a top-level "version:" field)',
		);
	}
	const match = raw.match(/^version:\s*["']?([^\s#"']+)["']?\s*(?:#.*)?$/m);
	if (!match) {
		throw new Error(
			`${declaredPath}: must declare a top-level "version:" field`,
		);
	}
	return parseVersion(match[1], declaredPath);
}

function readTextOrThrow(rootDir, relPath, expected, declaredPath) {
	try {
		return readFileSync(resolve(rootDir, relPath), "utf8");
	} catch {
		throw new Error(
			relPath +
				': file not found; expected version "' +
				expected +
				'" from ' +
				declaredPath,
		);
	}
}

function stripQuotes(value) {
	return String(value ?? "")
		.trim()
		.replace(/^["']/, "")
		.replace(/["']$/, "")
		.trim();
}

function compare(issues, relPath, label, expected, actual, declaredPath) {
	const value = stripQuotes(actual);
	if (value === expected) return;
	issues.push(
		relPath +
			": expected " +
			label +
			' "' +
			expected +
			'" (from ' +
			declaredPath +
			'), actual "' +
			value +
			'"',
	);
}

function readJsonVersion(rootDir, relPath, expected, declaredPath, issues) {
	const raw = readTextOrThrow(rootDir, relPath, expected, declaredPath);
	let data;
	try {
		data = JSON.parse(raw);
	} catch {
		throw new Error(`${relPath}: invalid JSON`);
	}
	compare(issues, relPath, "version", expected, data.version, declaredPath);
}

/** 收集文本里某个字段的全部取值（同一字段可能在 pbxproj 的多个 target 中重复）。 */
function collectMatches(raw, regex) {
	const values = [];
	for (const match of raw.matchAll(regex)) {
		values.push(stripQuotes(match[1]));
	}
	return values;
}

function compareAll(issues, relPath, label, expected, values, declaredPath) {
	const unique = [...new Set(values)];
	if (unique.length === 0) {
		issues.push(
			relPath +
				": expected " +
				label +
				' "' +
				expected +
				'" (from ' +
				declaredPath +
				"), actual marker not found",
		);
		return;
	}
	for (const value of unique) {
		compare(issues, relPath, label, expected, value, declaredPath);
	}
}

function checkServer(rootDir, declared, declaredPath, issues) {
	const version = readTextOrThrow(
		rootDir,
		"server/VERSION",
		declared,
		declaredPath,
	).trim();
	compare(issues, "server/VERSION", "version", declared, version, declaredPath);
	readJsonVersion(
		rootDir,
		"server/server/package.json",
		declared,
		declaredPath,
		issues,
	);
}

function checkWeb(rootDir, declared, declaredPath, issues) {
	readJsonVersion(
		rootDir,
		"client/web/package.json",
		declared,
		declaredPath,
		issues,
	);
}

function checkDesktop(rootDir, declared, declaredPath, issues) {
	readJsonVersion(
		rootDir,
		"client/desktop/package.json",
		declared,
		declaredPath,
		issues,
	);
	const raw = readTextOrThrow(
		rootDir,
		"client/desktop/mygo.config.ts",
		declared,
		declaredPath,
	);
	compareAll(
		issues,
		"client/desktop/mygo.config.ts",
		"version",
		declared,
		collectMatches(raw, /^\s*version:\s*["']([^"']+)["']/gm),
		declaredPath,
	);
}

function checkMobile(rootDir, declared, declaredPath, issues) {
	readJsonVersion(
		rootDir,
		"client/mobile/package.json",
		declared,
		declaredPath,
		issues,
	);

	const expectedCode = String(androidVersionCode(declared));

	const gradle = readTextOrThrow(
		rootDir,
		"client/mobile/android/app/build.gradle",
		declared,
		declaredPath,
	);
	compareAll(
		issues,
		"client/mobile/android/app/build.gradle",
		"versionName",
		declared,
		collectMatches(gradle, /versionName\s+"([^"]+)"/g),
		declaredPath,
	);
	compareAll(
		issues,
		"client/mobile/android/app/build.gradle",
		"versionCode",
		expectedCode,
		collectMatches(gradle, /versionCode\s+(\d+)/g),
		declaredPath,
	);

	const pbx = readTextOrThrow(
		rootDir,
		"client/mobile/ios/App/App.xcodeproj/project.pbxproj",
		declared,
		declaredPath,
	);
	compareAll(
		issues,
		"client/mobile/ios/App/App.xcodeproj/project.pbxproj",
		"MARKETING_VERSION",
		declared,
		collectMatches(pbx, /MARKETING_VERSION = ([^;]+);/g),
		declaredPath,
	);
	compareAll(
		issues,
		"client/mobile/ios/App/App.xcodeproj/project.pbxproj",
		"CURRENT_PROJECT_VERSION",
		expectedCode,
		collectMatches(pbx, /CURRENT_PROJECT_VERSION = ([^;]+);/g),
		declaredPath,
	);
}

function checkTag(tag, component, declared, declaredPath, issues) {
	const parsed = parseReleaseTag(tag);
	if (!parsed) {
		issues.push(
			'release tag "' +
				tag +
				'": expected ' +
				tagPrefix(component) +
				"<version> per the naming convention, actual does not match",
		);
		return;
	}
	if (parsed.component !== component) {
		issues.push(
			"release tag " +
				tag +
				": expected component " +
				component +
				", actual " +
				parsed.component,
		);
		return;
	}
	if (parsed.version !== declared) {
		issues.push(
			"release tag " +
				tag +
				": expected version " +
				declared +
				" for " +
				component +
				" (from " +
				declaredPath +
				"), actual " +
				parsed.version,
		);
	}
}

/**
 * 校验一个组件的版本一致性。
 * 返回 { component, declared, checked, issues }；issues 为空即通过。
 */
export function checkVersionState(rootDir, releaseTagArg, component) {
	const root = String(rootDir ?? "").trim() || process.cwd();
	const tag = String(releaseTagArg ?? "").trim();
	const parsed = tag === "" ? null : parseReleaseTag(tag);
	const comp = normalizeComponent(component) ?? parsed?.component;
	if (!comp) {
		throw new Error(
			"component is required when releaseTag is absent; usage: check-version.mjs [rootDir] [releaseTag] [server|web|desktop|mobile]",
		);
	}

	const declaredPath = declaredPathOf(comp);
	const declared = readDeclaration(root, declaredPath);
	const issues = [];

	if (comp === "server") checkServer(root, declared, declaredPath, issues);
	else if (comp === "web") checkWeb(root, declared, declaredPath, issues);
	else if (comp === "desktop")
		checkDesktop(root, declared, declaredPath, issues);
	else checkMobile(root, declared, declaredPath, issues);

	if (tag !== "") checkTag(tag, comp, declared, declaredPath, issues);

	return {
		component: comp,
		declared,
		checked: CHECKED_FILES[comp].slice(),
		issues,
	};
}

function main() {
	const rootDir = process.argv[2] ?? process.cwd();
	const isTagEvent = process.env.GITHUB_REF_TYPE === "tag";
	// 仅在显式传入 tag 或当前为 tag 事件时，才把 ref 当作发布标签校验；
	// push 到分支时 GITHUB_REF_NAME 是分支名，不是合法 tag。
	const releaseTagArg = isTagEvent
		? (process.argv[3] ??
			process.env.RELEASE_TAG ??
			process.env.GITHUB_REF_NAME ??
			"")
		: (process.argv[3] ?? process.env.RELEASE_TAG ?? "");
	const component =
		process.argv[4] ?? process.env.GOSPEAK_COMPONENT ?? undefined;

	let result;
	try {
		result = checkVersionState(rootDir, releaseTagArg, component);
	} catch (err) {
		console.error(`::error::${err instanceof Error ? err.message : err}`);
		process.exitCode = 1;
		return;
	}

	if (result.issues.length > 0) {
		for (const issue of result.issues) {
			console.error(`::error::${issue}`);
		}
		process.exitCode = 1;
		return;
	}

	console.log(
		"version consistency ok: component=" +
			result.component +
			" declared=" +
			result.declared +
			" files=" +
			result.checked.length,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
