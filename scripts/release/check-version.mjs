#!/usr/bin/env node
// 四端版本一致性校验 —— 根仓 .github/versions/<component>.yaml 是单一事实源，
// 子仓里的派生文件只读比对，绝不写入。
//
// 用法：node scripts/release/check-version.mjs [rootDir] [releaseTag] [component]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function read(path) {
	return readFileSync(path, "utf8");
}

function readJson(path) {
	return JSON.parse(read(path));
}

function declaredVersion(rootDir, component) {
	const raw = read(join(rootDir, ".github", "versions", `${component}.yaml`));
	const match = raw.match(
		/^version:[ \t]*["']?([^"'\s#]+)["']?[ \t]*(?:#.*)?$/m,
	);
	if (!match)
		throw new Error(`missing version in .github/versions/${component}.yaml`);
	if (!SEMVER.test(match[1]))
		throw new Error(`invalid semver in ${component}.yaml: ${match[1]}`);
	return match[1];
}

function versionOfPackage(path, label, issues) {
	try {
		const version = String(readJson(path).version ?? "").trim();
		if (version !== label.declared) {
			issues.push(`${label.name} ${version} != declared ${label.declared}`);
		}
	} catch (error) {
		issues.push(`${label.name} unreadable: ${error.message}`);
	}
}

export function androidVersionCode(version) {
	const [major, minor, patch] = String(version)
		.split("-")[0]
		.split(".")
		.map(Number);
	return major * 10000 + minor * 100 + patch;
}

export function checkVersionState(rootDir, releaseTag, component) {
	const issues = [];
	const declared = declaredVersion(rootDir, component);

	if (component === "server") {
		const version = read(join(rootDir, "server", "VERSION")).trim();
		if (version !== declared)
			issues.push(`server/VERSION ${version} != declared ${declared}`);
		// package.json 是历史遗留副本（1.0.1），只告警不阻塞
		try {
			const pkg = String(
				readJson(join(rootDir, "server", "server", "package.json")).version ??
					"",
			);
			if (pkg !== declared)
				console.warn(
					`::warning::server/server/package.json ${pkg} != declared ${declared}（仅告警）`,
				);
		} catch {}
	}

	if (component === "web") {
		versionOfPackage(
			join(rootDir, "client", "web", "package.json"),
			{ name: "client/web/package.json", declared },
			issues,
		);
	}

	if (component === "desktop") {
		versionOfPackage(
			join(rootDir, "client", "desktop", "package.json"),
			{ name: "client/desktop/package.json", declared },
			issues,
		);
		try {
			const src = read(join(rootDir, "client", "desktop", "mygo.config.ts"));
			const m = src.match(/version:\s*["']([^"']+)["']/);
			if (!m || m[1] !== declared)
				issues.push(
					`client/desktop/mygo.config.ts ${m ? m[1] : "missing"} != declared ${declared}`,
				);
		} catch (error) {
			issues.push(`client/desktop/mygo.config.ts unreadable: ${error.message}`);
		}
	}

	if (component === "mobile") {
		versionOfPackage(
			join(rootDir, "client", "mobile", "package.json"),
			{ name: "client/mobile/package.json", declared },
			issues,
		);
		const gradle = join(
			rootDir,
			"client",
			"mobile",
			"android",
			"app",
			"build.gradle",
		);
		try {
			const src = read(gradle);
			const name = src.match(/versionName\s+"([^"]+)"/);
			const code = src.match(/versionCode\s+(\d+)/);
			if (!name || name[1] !== declared)
				issues.push(
					`build.gradle versionName ${name ? name[1] : "missing"} != declared ${declared}`,
				);
			const expected = String(androidVersionCode(declared));
			if (!code || code[1] !== expected)
				issues.push(
					`build.gradle versionCode ${code ? code[1] : "missing"} != expected ${expected}`,
				);
		} catch (error) {
			issues.push(`build.gradle unreadable: ${error.message}`);
		}
	}

	const tag = String(releaseTag ?? "").trim();
	if (tag) {
		const m = tag.match(/^gospeak-(server|web|desktop|mobile)-v(.+)$/);
		if (!m) issues.push(`unrecognized release tag: ${tag}`);
		else if (m[1] !== component)
			issues.push(`tag component ${m[1]} != ${component}`);
		else if (m[2] !== declared)
			issues.push(`tag version ${m[2]} != declared ${declared}`);
	}

	return { component, declared, issues };
}

if (
	process.argv[1] &&
	import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
	const [rootDir = ".", releaseTag = "", component = "server"] =
		process.argv.slice(2);
	let failed = false;
	for (const c of component === "all"
		? ["server", "web", "desktop", "mobile"]
		: [component]) {
		try {
			const state = checkVersionState(rootDir, releaseTag, c);
			if (state.issues.length === 0)
				console.log(
					`version consistency ok: component=${c} declared=${state.declared}`,
				);
			else {
				failed = true;
				for (const issue of state.issues) console.error(`::error::${issue}`);
			}
		} catch (error) {
			failed = true;
			console.error(`::error::${c}: ${error.message}`);
		}
	}
	process.exit(failed ? 1 : 0);
}
