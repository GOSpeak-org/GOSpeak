#!/usr/bin/env node
// 四端发布命名规范的唯一实现（根仓发版链）。
//   tag      gospeak-<component>-v<version>
//   产物     gospeak-<component>-v<version>-<os>-<arch>[.exe]
//   校验和   SHA256SUMS-gospeak-<component>-v<version>.txt
import { pathToFileURL } from "node:url";

export const COMPONENTS = ["server", "web", "desktop", "mobile"];

export function normalizeComponent(raw) {
	const value = String(raw ?? "")
		.trim()
		.toLowerCase();
	return COMPONENTS.includes(value) ? value : null;
}

export function prefix(component) {
	const c = normalizeComponent(component);
	if (!c) throw new Error(`unknown component: ${component}`);
	return `gospeak-${c}-v`;
}

export function tag(component, version) {
	const v = String(version ?? "").trim();
	if (!v) throw new Error("version is required");
	return `${prefix(component)}${v}`;
}

export function parse(releaseTag) {
	const raw = String(releaseTag ?? "").trim();
	for (const component of COMPONENTS) {
		const p = `gospeak-${component}-v`;
		if (raw.startsWith(p)) {
			const version = raw.slice(p.length);
			if (!version) throw new Error(`missing version in tag: ${raw}`);
			return { component, version };
		}
	}
	throw new Error(`unrecognized release tag: ${raw}`);
}

export function artifactTarget(component, version, target, ext) {
	const suffix = ext ? `.${ext}` : "";
	return `gospeak-${component}-v${version}-${target}${suffix}`;
}

export function checksum(component, version) {
	return `SHA256SUMS-gospeak-${component}-v${version}.txt`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [cmd, ...rest] = process.argv.slice(2);
	try {
		if (cmd === "tag") console.log(tag(rest[0], rest[1]));
		else if (cmd === "prefix") console.log(prefix(rest[0]));
		else if (cmd === "parse")
			console.log(parse(rest[0]).component + " " + parse(rest[0]).version);
		else if (cmd === "artifact-target")
			console.log(artifactTarget(rest[0], rest[1], rest[2], rest[3]));
		else if (cmd === "checksum") console.log(checksum(rest[0], rest[1]));
		else {
			console.error(
				"usage: release-naming.mjs <tag|prefix|parse|artifact-target|checksum> ...",
			);
			process.exit(1);
		}
	} catch (error) {
		console.error(String(error.message ?? error));
		process.exit(1);
	}
}
