#!/usr/bin/env node
// 聚合 Release 页（按日期一页）—— 标题 GOSpeak-<YYMMDD>。
//
// 用法：
//   node scripts/release/render-aggregate.mjs --repo <owner/repo> --date YYYY-MM-DD
//        [--out <file>] [--no-gh] [--root <dir>] [--fixtures <dir>]
//
// 三张表：桌面端 / 移动端 / 服务端。每行直链
//   https://github.com/<repo>/releases/download/<tag>/<asset>
//
// 资产名必须来自真实 Release：默认对每个组件执行
//   gh release view <tag> --json assets,tagName
// --no-gh 时改读本地 fixture JSON（<fixtures>/<component>.json），供测试与离线预览：
//   { "tagName": "gospeak-desktop-v1.4.0-rc.1", "assets": [{ "name": "..." }] }
// 默认 fixtures 目录：<root>/.github/release-fixtures。
//
// 组件版本仍以 .github/versions/<component>.yaml 为单一事实来源；tag 由
// release-naming.mjs 派生。某个端尚未发布时该表降级为「未发布」，不中断整页。

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { releaseTag, tagPrefix } from "./release-naming.mjs";

const TABLE_COMPONENTS = ["desktop", "mobile", "server"];

const VERSION_FILE_OF = {
	server: ".github/versions/server.yaml",
	web: ".github/versions/web.yaml",
	desktop: ".github/versions/desktop.yaml",
	mobile: ".github/versions/mobile.yaml",
};

// 由长到短，保证 tar.gz 先于 gz 之类的后缀命中。
const KNOWN_EXTS = ["tar.gz", "dmg", "deb", "exe", "apk"];

const TARGET_ORDER = {
	desktop: [
		"darwin-arm64",
		"darwin-amd64",
		"windows-amd64",
		"linux-amd64",
		"linux-arm64",
	],
	server: [
		"linux-amd64",
		"linux-arm64",
		"linux-armv7",
		"darwin-arm64",
		"darwin-amd64",
		"freebsd-amd64",
		"freebsd-arm64",
		"openbsd-amd64",
		"windows-amd64",
		"windows-arm64",
	],
	mobile: ["android"],
};

const OS_LABEL = {
	darwin: "macOS",
	windows: "Windows",
	linux: "Linux",
	freebsd: "FreeBSD",
	openbsd: "OpenBSD",
	android: "Android",
};

const ARCH_LABEL = {
	amd64: "x64",
	arm64: "arm64",
	armv7: "armv7",
	universal: "universal",
};

const LINK_LABEL = {
	dmg: "DMG",
	deb: "DEB",
	exe: "EXE",
	"tar.gz": "TAR.GZ",
	apk: "APK",
	"": "BIN",
};

const HEADING_OF = {
	desktop: "桌面端",
	mobile: "移动端",
	server: "服务端",
};

const LEGACY_REPOS = ["GOSpeak-Server", "GOSpeak-Client"];

const TICK = "\u0060";

function code(value) {
	return TICK + value + TICK;
}

/** 聚合页 tag：2026-11-28 -> GOSpeak-261128 */
export function aggregateTag(date) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
	if (!match) {
		throw new Error(
			`invalid --date ${JSON.stringify(date)}; expected YYYY-MM-DD`,
		);
	}
	return `GOSpeak-${match[1].slice(2)}${match[2]}${match[3]}`;
}

export function readDeclaredVersion(rootDir, component) {
	const relPath = VERSION_FILE_OF[component];
	let raw;
	try {
		raw = readFileSync(resolve(rootDir, relPath), "utf8");
	} catch {
		throw new Error(
			`${relPath}: version declaration file not found (expected a top-level "version:" field)`,
		);
	}
	const match = raw.match(/^version:\s*["']?([^\s#"']+)["']?\s*(?:#.*)?$/m);
	if (!match) {
		throw new Error(`${relPath}: must declare a top-level "version:" field`);
	}
	return match[1];
}

/**
 * 取一个组件的 Release 资产清单。
 * gh 失败（尚未建 Release / 无 gh）时返回 missing，页面降级为「未发布」。
 */
export function fetchRelease({
	component,
	tag,
	repo,
	noGh,
	fixturesDir,
	silent = false,
}) {
	if (noGh) {
		const path = resolve(fixturesDir, `${component}.json`);
		if (!existsSync(path)) {
			return { tagName: tag, assets: [], missing: true };
		}
		let data;
		try {
			data = JSON.parse(readFileSync(path, "utf8"));
		} catch {
			throw new Error(`invalid fixture JSON: ${path}`);
		}
		const assets = Array.isArray(data.assets)
			? data.assets
					.map((asset) =>
						typeof asset === "string" ? asset : String(asset?.name ?? ""),
					)
					.filter(Boolean)
			: [];
		return {
			tagName: String(data.tagName || tag),
			assets,
			missing: assets.length === 0,
		};
	}

	try {
		const out = execFileSync(
			"gh",
			["release", "view", tag, "--repo", repo, "--json", "assets,tagName"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
		const data = JSON.parse(out);
		const assets = Array.isArray(data.assets)
			? data.assets.map((asset) => String(asset?.name ?? "")).filter(Boolean)
			: [];
		return {
			tagName: String(data.tagName || tag),
			assets,
			missing: assets.length === 0,
		};
	} catch {
		if (!silent) {
			process.stderr.write(
				"[render-aggregate] warning: gh release view " +
					tag +
					" failed; table degrades to 未发布\n",
			);
		}
		return { tagName: tag, assets: [], missing: true };
	}
}

function parseAsset(component, version, name) {
	const prefix = `gospeak-${component}-v${version}-`;
	if (!name.startsWith(prefix)) return null;
	const rest = name.slice(prefix.length);
	for (const ext of KNOWN_EXTS) {
		const suffix = `.${ext}`;
		if (rest.endsWith(suffix)) {
			return { target: rest.slice(0, -suffix.length), ext };
		}
	}
	return { target: rest, ext: "" };
}

function labelsFor(component, target) {
	if (component === "mobile") {
		return { platform: "Android", arch: "universal" };
	}
	const parts = target.split("-");
	const os = parts[0] ?? "";
	const arch = parts.slice(1).join("-");
	return {
		platform: OS_LABEL[os] ?? (os || "-"),
		arch: ARCH_LABEL[arch] ?? (arch || "-"),
	};
}

function rankOf(component, target) {
	const order = TARGET_ORDER[component] ?? [];
	const index = order.indexOf(target);
	return index < 0 ? order.length + 1 : index;
}

function assetUrl(repo, tag, asset) {
	return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

/** 渲染单个组件的资产表（四列：平台 / 架构 / 下载 / 文件）。 */
export function renderTable(component, release, repo, version) {
	const lines = ["| 平台 | 架构 | 下载 | 文件 |", "|:---|:---|:---:|:---|"];
	if (release.missing || release.assets.length === 0) {
		lines.push("| — | — | 未发布 | — |");
		return lines.join("\n");
	}

	const rows = [];
	let checksum = null;
	for (const name of release.assets) {
		if (name === `SHA256SUMS-${release.tagName}.txt`) {
			checksum = name;
			continue;
		}
		const parsed = parseAsset(component, version, name);
		if (!parsed) {
			rows.push({
				platform: "其他",
				arch: "-",
				label: "FILE",
				name,
				rank: 1000,
			});
			continue;
		}
		const labels = labelsFor(component, parsed.target);
		rows.push({
			platform: labels.platform,
			arch: labels.arch,
			label: LINK_LABEL[parsed.ext] ?? (parsed.ext.toUpperCase() || "FILE"),
			name,
			rank: rankOf(component, parsed.target),
		});
	}

	rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
	for (const row of rows) {
		lines.push(
			"| " +
				row.platform +
				" | " +
				row.arch +
				" | [" +
				row.label +
				"](" +
				assetUrl(repo, release.tagName, row.name) +
				") | " +
				code(row.name) +
				" |",
		);
	}
	if (checksum) {
		lines.push(
			"| **校验和** | 全部文件 | [SHA-256](" +
				assetUrl(repo, release.tagName, checksum) +
				") | " +
				code(checksum) +
				" |",
		);
	}
	return lines.join("\n");
}

/** 渲染整页 markdown；releases 形如 { desktop: { tagName, assets, missing, version } }。 */
function releasePageUrl(repo, tag) {
	return `https://github.com/${repo}/releases/tag/${tag}`;
}

function releaseQueryUrl(repo, component) {
	return `https://github.com/${repo}/releases?q=${tagPrefix(component)}`;
}
export function renderAggregate({ repo, date, releases }) {
	const tag = aggregateTag(date);
	const owner = String(repo).split("/")[0];
	const lines = [];
	lines.push(`# ${tag}`);
	lines.push("");
	lines.push(
		"> 本页汇总 GOSpeak 桌面端、移动端与服务端本次发布的全部产物；四端版本独立，点击链接直接下载。",
	);
	lines.push("");

	for (const component of TABLE_COMPONENTS) {
		const release = releases?.[component] ?? {
			tagName: releaseTag(component, "0.0.0"),
			assets: [],
			missing: true,
			version: "0.0.0",
		};
		const published = !release.missing && release.assets.length > 0;
		// 已发布：标题里的 tag 是可点的 Release 链接；未发布：保持纯文本，不生成死链。
		const title = published
			? `[${code(release.tagName)}](${releasePageUrl(repo, release.tagName)})`
			: code(release.tagName);
		lines.push(`## ${HEADING_OF[component]} · ${title}`);
		lines.push("");
		if (published) {
			lines.push(
				"查看该端全部 Release：[" +
					tagPrefix(component) +
					"*](" +
					releaseQueryUrl(repo, component) +
					")",
			);
			lines.push("");
		}
		lines.push(renderTable(component, release, repo, release.version));
		lines.push("");
	}

	lines.push("---");
	lines.push("");
	lines.push("### 历史版本");
	lines.push("");
	lines.push(
		"- 旧仓历史入口：" +
			LEGACY_REPOS.map(
				(name) => `[${name}](https://github.com/${owner}/${name}/releases)`,
			).join(" · "),
	);
	lines.push("");
	return lines.join("\n");
}

function parseArgs(argv) {
	const options = { noGh: false, root: process.cwd() };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--no-gh") {
			options.noGh = true;
			continue;
		}
		if (!arg.startsWith("--")) {
			throw new Error(`unexpected argument ${JSON.stringify(arg)}`);
		}
		const key = arg.slice(2);
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`option ${arg} requires a value`);
		}
		options[key] = value;
		i += 1;
	}
	return options;
}

function main() {
	try {
		const options = parseArgs(process.argv.slice(2));
		const repo = String(options.repo ?? "").trim();
		if (repo === "") throw new Error("--repo is required");
		if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
			throw new Error(
				`invalid --repo ${JSON.stringify(repo)}; expected owner/repo`,
			);
		}
		const date = String(options.date ?? "").trim();
		if (date === "") throw new Error("--date is required");
		aggregateTag(date);

		const root = resolve(options.root);
		const fixturesDir = resolve(
			options.fixtures ?? resolve(root, ".github/release-fixtures"),
		);

		const releases = {};
		for (const component of TABLE_COMPONENTS) {
			const version = readDeclaredVersion(root, component);
			const expectedTag = releaseTag(component, version);
			const info = fetchRelease({
				component,
				tag: expectedTag,
				repo,
				noGh: options.noGh,
				fixturesDir,
			});
			releases[component] = {
				version,
				expectedTag,
				tagName: info.tagName,
				assets: info.assets,
				missing: info.missing,
			};
		}

		const markdown = renderAggregate({ repo, date, releases });
		process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
		if (options.out) {
			const outPath = resolve(options.out);
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(
				outPath,
				markdown.endsWith("\n") ? markdown : `${markdown}\n`,
			);
			process.stderr.write(`[render-aggregate] wrote ${outPath}\n`);
		}
	} catch (err) {
		console.error(`::error::${err instanceof Error ? err.message : err}`);
		process.exitCode = 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
