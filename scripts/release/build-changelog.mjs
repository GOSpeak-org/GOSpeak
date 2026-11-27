#!/usr/bin/env node
// 生成指定组件、指定版本的 CHANGELOG 段落，并幂等插入该组件的 CHANGELOG.md。
//
// 用法：
//   node scripts/release/build-changelog.mjs --component <server|web|desktop|mobile>
//        --version <semver> [--baseline <tag>] [--date YYYY-MM-DD] [--no-write]
//        [--replace] [--exclude-ci] [--root <dir>]
//
//   --component  必填，决定 CHANGELOG 位置、默认基线 tag 与 compare 链接
//   --version    必填，形如 X.Y.Z（可带 -pre/+build）
//   --baseline   可选，比较基线 tag；缺省取该组件最近 tag（gospeak-<c>-v*）
//   --date       可选，段落日期；缺省今天（YYYY-MM-DD）
//   --no-write   只打印段落，不落盘（workflow 用它生成 Release 正文）
//   --replace    覆盖同版本段落（默认幂等：已存在同版本标题时跳过插入）
//   --root       可选，仓库根目录；缺省 process.cwd()
//
// 组件 -> CHANGELOG 路径：
//   server  -> server/CHANGELOG.md
//   web     -> client/web/CHANGELOG.md
//   desktop -> client/desktop/CHANGELOG.md
//   mobile  -> client/mobile/CHANGELOG.md
//
// 插入锚点（确定性规则）：
//   锚点固定为 H1（# ...）标题之后的第一个位置，即新版本段落紧贴 H1 下方，
//   最新版本永远在最上面。文件末尾允许有一个「## 历史版本」分节（含旧仓链接），
//   它不参与锚点计算，永远保持在最下方；没有该分节时就正常插入。
//
// 分类沿用 release-please 的 changelog-sections（SECTION_OF / SECTION_ORDER），
// 与历史 Release 正文保持同一种写法。段落输出即 release-notes.mjs 的「更新日志」来源。

import { execSync as ex } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { releaseTag, tagPrefix } from "./release-naming.mjs";

const MONOREPO_URL = "https://github.com/GOSpeak-org/GOSpeak";
const CHANGELOG_HEADER = "# Changelog / 更新日志";

const COMPONENTS = ["server", "web", "desktop", "mobile"];

export const CHANGELOG_PATH_OF = {
	server: "server/CHANGELOG.md",
	web: "client/web/CHANGELOG.md",
	desktop: "client/desktop/CHANGELOG.md",
	mobile: "client/mobile/CHANGELOG.md",
};

// type -> 展示 section 标题，与历史 release-please 的 changelog-sections 对齐
export const SECTION_OF = {
	feat: "Features",
	fix: "Bug Fixes",
	perf: "Performance",
	docs: "Documentation",
	ci: "CI/CD",
	refactor: "Refactoring",
	style: "Styles",
	test: "Tests",
	build: "Build",
	chore: "Chores",
	revert: "Reverts",
};

export const SECTION_ORDER = [
	"Features",
	"Bug Fixes",
	"Performance",
	"Documentation",
	"CI/CD",
	"Refactoring",
	"Styles",
	"Tests",
	"Build",
	"Chores",
	"Reverts",
];

const CC_PATTERN =
	/^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<break>!)?:[ \t]+(?<desc>.*)$/;

const CI_SUBJECT_PATTERNS = [
	/\bci(?:\/cd)?\b/i,
	/\brelease-please\b/i,
	/\bgithub actions?\b/i,
	/\bworkflows?\b/i,
	/\bcross[- ]compile(?:d)?\b/i,
	/\bversion consistency\b/i,
	/\brelease workflow\b/i,
	/\bcreate-release\b/i,
	/\bpublish release\b/i,
	/\bdependabot\b/i,
	/发版流程|发布流程|发版|发布时|版本一致性/,
];

function sh(cmd, cwd) {
	try {
		return ex(cmd, {
			encoding: "utf-8",
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

function isCIRelated(commit, match, root) {
	const type = match?.groups?.type?.toLowerCase();
	const scope = match?.groups?.scope?.toLowerCase();
	if (
		type === "ci" ||
		type === "release" ||
		scope === "ci" ||
		scope === "release"
	) {
		return true;
	}
	if (CI_SUBJECT_PATTERNS.some((pattern) => pattern.test(commit.subject))) {
		return true;
	}

	const changedFiles = sh(
		`git diff-tree --no-commit-id --name-only -r --root ${commit.hash}`,
		root,
	)
		.split("\n")
		.filter(Boolean);
	return changedFiles.some(
		(file) =>
			file.startsWith(".github/workflows/") ||
			file.startsWith(".github/actions/") ||
			file === "lefthook.yml" ||
			file === "commitlint.config.js",
	);
}

/**
 * 在 tag 列表里挑本组件的比较基线：必须是本组件前缀，且排除本次要发布的
 * 那个 tag（CI 在 tag 已存在的检出上跑时，最近 tag 就是当前 tag）。
 */
export function pickBaseline(tags, component, version) {
	const prefix = tagPrefix(component);
	const current = version ? releaseTag(component, version) : "";
	return (
		tags
			.map((tag) => String(tag).trim())
			.find((tag) => tag.startsWith(prefix) && tag !== current) || ""
	);
}

function latestTag(component, root, version) {
	// 按组件取最近 tag：server 只认 gospeak-server-v*，不区分组件会让
	// 桌面端拿主体 tag 当基线，把别的端的提交历史错算成自己的变更。
	const tags = sh("git tag --list --sort=-creatordate", root).split("\n");
	return pickBaseline(tags, component, version);
}

function collectCommits(range, root) {
	// 每条提交：hash \x1f subject \x1f body \x1e
	const log = sh(`git log ${range} --pretty=format:'%H%x1f%s%x1f%b%x1e'`, root);
	if (!log) return [];
	const out = [];
	for (const entry of log.split("\x1e")) {
		if (!entry.trim()) continue;
		const [hash, subject, body = ""] = entry.split("\x1f");
		out.push({
			hash: hash.trim().slice(0, 7),
			subject: subject.trim(),
			body: body.trim(),
		});
	}
	return out;
}

export function classify(commits, excludeCI = false, root) {
	// section -> [{ scope, desc }]
	const map = {};
	for (const section of SECTION_ORDER) map[section] = [];

	for (const commit of commits) {
		const match = commit.subject.match(CC_PATTERN);
		if (excludeCI && isCIRelated(commit, match, root)) continue;
		let section = "Chores";
		let scope = "";
		let desc = commit.subject;
		if (match?.groups) {
			const type = match.groups.type.toLowerCase();
			scope = match.groups.scope || "";
			desc = match.groups.desc || commit.subject;
			section = SECTION_OF[type] || "Chores";
		}
		map[section].push({ scope, desc });
	}
	return map;
}

function compareUrl(component, version, baseline) {
	const tag = releaseTag(component, version);
	if (!baseline) return `${MONOREPO_URL}/releases/tag/${tag}`;
	return `${MONOREPO_URL}/compare/${baseline}...${tag}`;
}

/**
 * 渲染一个版本段落（纯函数，不碰文件系统）。
 * 返回以单个换行结尾的 markdown。
 */
export function buildSection({
	component,
	version,
	baseline,
	date,
	commits,
	excludeCI = false,
	root,
}) {
	const lines = [];
	lines.push(
		"## [" +
			version +
			"](" +
			compareUrl(component, version, baseline) +
			") (" +
			date +
			")",
	);
	lines.push("");
	const map = classify(commits, excludeCI, root);
	let any = false;
	for (const section of SECTION_ORDER) {
		const items = map[section];
		if (!items.length) continue;
		any = true;
		lines.push(`### ${section}`);
		lines.push("");
		for (const item of items) {
			const scoped = item.scope ? `${item.scope}: ` : "";
			lines.push(`* ${scoped}${item.desc}`);
		}
		lines.push("");
	}
	if (!any) {
		lines.push("* 无分类变更");
		lines.push("");
	}
	return lines.join("\n").replace(/\n+$/, "\n");
}

function hasVersionSection(content, version) {
	const heading = `## [${version}]`;
	return content.split("\n").some((line) => line.startsWith(heading));
}

/**
 * 去掉同版本段落（连同段落前的空行）。
 * 只匹配目标版本标题，不会碰「## 历史版本」等其它分节。
 */
function removeVersionSection(content, version) {
	const heading = `## [${version}]`;
	const lines = content.split("\n");
	const start = lines.findIndex((line) => line.startsWith(heading));
	if (start < 0) return content;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i += 1) {
		if (lines[i].startsWith("## ")) {
			end = i;
			break;
		}
	}
	let from = start;
	while (from > 0 && lines[from - 1].trim() === "") from -= 1;
	lines.splice(from, end - from);
	return lines.join("\n");
}

/**
 * 确定性插入：新版本段落放在 H1 下方、第一个 ## 分节之前（最新在上）。
 * H1 与紧邻的导语（例如一行历史说明）保持贴在一起，不会被新版本挤到下方；
 * 末尾的「## 历史版本」分节既不参与锚点计算，也不会被移动。
 */
function insertAtTop(content, block) {
	const h1 = content.match(/^# [^\n]*/m);
	if (!h1) {
		const rest = content.trim() === "" ? "" : content.replace(/^\n+/, "");
		return `${CHANGELOG_HEADER}\n\n${block}${rest === "" ? "" : `\n${rest}`}`;
	}
	const afterH1 = h1.index + h1[0].length;
	const rest = content.slice(afterH1);
	const sectionOffset = rest.search(/^## /m);
	if (sectionOffset < 0) {
		return `${content.replace(/\s+$/, "")}\n\n${block}`;
	}
	const head = content.slice(0, afterH1 + sectionOffset).replace(/\s+$/, "");
	const tail = content.slice(afterH1 + sectionOffset);
	return `${head}\n\n${block}\n${tail}`;
}

/**
 * 幂等插入 / 覆盖同版本段落：
 *   - 已存在同版本段落且未传 --replace：原样返回（不产生两个同名段落）；
 *   - --replace：先摘掉旧段落，再按锚点插到 H1 下方；
 *   - 历史版本分节始终留在文件末尾。
 * filePath 由调用方给出（测试用临时文件，workflow 用仓库内 CHANGELOG.md）。
 */
export function insertChangelog(
	filePath,
	newBlock,
	version,
	replaceExisting = false,
) {
	if (!existsSync(filePath)) {
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, `${CHANGELOG_HEADER}\n\n${newBlock}`);
		return filePath;
	}
	let content = readFileSync(filePath, "utf-8");
	const duplicate = hasVersionSection(content, version);
	if (duplicate && !replaceExisting) return filePath;
	if (duplicate) content = removeVersionSection(content, version);
	content = insertAtTop(content, newBlock);
	writeFileSync(filePath, content);
	return filePath;
}

function parseArgs(argv) {
	const options = {
		component: undefined,
		version: undefined,
		baseline: undefined,
		date: undefined,
		write: true,
		replace: false,
		excludeCI: false,
		root: process.cwd(),
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = () => {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith("--")) {
				throw new Error(`option ${arg} requires a value`);
			}
			i += 1;
			return value;
		};
		if (arg === "--no-write") options.write = false;
		else if (arg === "--replace") options.replace = true;
		else if (arg === "--exclude-ci") options.excludeCI = true;
		else if (arg === "--component") options.component = next();
		else if (arg === "--version") options.version = next();
		else if (arg === "--baseline") options.baseline = next();
		else if (arg === "--date") options.date = next();
		else if (arg === "--root") options.root = next();
		else throw new Error(`unknown argument ${JSON.stringify(arg)}`);
	}
	return options;
}

function main() {
	try {
		const options = parseArgs(process.argv.slice(2));
		if (!options.version) {
			throw new Error(
				"usage: build-changelog.mjs --component <server|web|desktop|mobile> --version <semver> [--baseline <tag>] [--date YYYY-MM-DD] [--no-write] [--replace] [--root <dir>]",
			);
		}
		const component = String(options.component ?? "").trim();
		if (!COMPONENTS.includes(component)) {
			throw new Error(
				"unknown --component " +
					JSON.stringify(options.component) +
					'; expected one of "server", "web", "desktop", "mobile"',
			);
		}
		const date = options.date || new Date().toISOString().slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			throw new Error(
				`invalid --date ${JSON.stringify(date)}; expected YYYY-MM-DD`,
			);
		}
		const root = resolve(options.root);
		const baseline =
			options.baseline === undefined
				? latestTag(component, root, options.version)
				: options.baseline;
		const range = baseline ? `${baseline}..HEAD` : "HEAD";
		const commits = collectCommits(range, root);
		const block = buildSection({
			component,
			version: options.version,
			baseline,
			date,
			commits,
			excludeCI: options.excludeCI,
			root,
		});
		if (options.write) {
			insertChangelog(
				resolve(root, CHANGELOG_PATH_OF[component]),
				block,
				options.version,
				options.replace,
			);
		}
		process.stdout.write(block);
		console.error(
			"\n[build-changelog] component=" +
				component +
				" version=" +
				options.version +
				" baseline=" +
				(baseline || "none") +
				" commits=" +
				commits.length +
				" write=" +
				options.write +
				" changelog=" +
				CHANGELOG_PATH_OF[component],
		);
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
