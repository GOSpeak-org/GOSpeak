#!/usr/bin/env node
// GitHub Release 正文生成器（monorepo 四端，一组件一 Release）。
//
// 正文结构固定四段，顺序不可换：
//   1. 手写 notes —— --notes-file；缺省读 .github/versions/<component>.yaml 的 notes: 块
//   2. ## 下载   —— 该端平台表格（沿用旧徽章风格）
//   3. ## 更新日志 —— 与 build-changelog.mjs 同源（build-changelog 的段落输出）
//   4. ## 校验   —— SHA256SUMS-<tag>.txt
//
// 用法：
//   node scripts/release/release-notes.mjs release \
//        --component <server|web|desktop|mobile> --version <semver> \
//        --tag <gospeak-<component>-v<semver>> --repo <owner/repo> \
//        [--changelog-file <path>] [--notes-file <path>] [--assets-dir <dir>]
//        [--root <dir>]
//
// 输出写到 stdout。所有产物名由 scripts/release/release-naming.mjs 派生，
// 本文件不手拼文件名（web 的 dist tar 也经由 artifact-target 生成）。
//
// --assets-dir：给出 Release 资产目录时，「## 下载」按目录里真实存在的文件渲染
// （避免把 CI 没产出的平台写成 404 死链）；目录里没有 SHA256SUMS-<tag>.txt 时
// 「## 校验」整段省略。不给 --assets-dir 时保持按预期平台清单渲染。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CHANGELOG_PATH_OF } from "./build-changelog.mjs";
import {
	artifactForTarget,
	checksumName,
	parseReleaseTag,
	releaseTag,
} from "./release-naming.mjs";

const COMPONENTS = ["server", "web", "desktop", "mobile"];

// 反引号统一从转义序列取，避免正文里的行内代码散落在各处。
const TICK = "\u0060";

function code(value) {
	return TICK + value + TICK;
}

function badge(label, color, logo) {
	return (
		"![Download " +
		label +
		"](https://img.shields.io/badge/Download-" +
		label +
		"-" +
		color +
		"?style=for-the-badge&logo=" +
		logo +
		"&logoColor=white)"
	);
}

const PLATFORM_BADGE = {
	dmg: badge("DMG", "000000", "apple"),
	deb: badge("DEB", "FCC624", "linux"),
	exe: badge("EXE", "0078D4", "windows11"),
	"tar.gz": badge("TAR.GZ", "FCC624", "linux"),
	apk: badge("APK", "3DDC84", "android"),
};

// ── --assets-dir：按 Release 目录里真实存在的文件渲染下载表 ─────────────
// 平台标签由文件名推导；未知文件名原样展示，不抛错。
const ASSET_EXTS = ["tar.gz", "dmg", "deb", "exe", "apk", "zip", "yml"];
const ASSET_OS_LABEL = {
	darwin: "macOS",
	windows: "Windows",
	linux: "Linux",
	freebsd: "FreeBSD",
	openbsd: "OpenBSD",
};

/** 人类可读体积：11.2 MB / 512.0 KB / 3 B。 */
export function formatBytes(bytes) {
	const value = Number(bytes);
	if (!Number.isFinite(value) || value <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = value;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit += 1;
	}
	if (unit === 0) return `${Math.round(size)} ${units[0]}`;
	return `${size.toFixed(1)} ${units[unit]}`;
}

function parseAssetFileName(component, version, fileName) {
	const prefix = `gospeak-${component}-v${version}-`;
	if (!fileName.startsWith(prefix)) return null;
	const rest = fileName.slice(prefix.length);
	for (const ext of ASSET_EXTS) {
		const suffix = `.${ext}`;
		if (rest.endsWith(suffix)) {
			return { target: rest.slice(0, -suffix.length), ext };
		}
	}
	return { target: rest, ext: "" };
}

/** 由产物文件名推导可读平台标签；无法识别时原样返回文件名。 */
export function readableAssetLabel(component, version, fileName) {
	const parsed = parseAssetFileName(component, version, fileName);
	if (!parsed) return fileName;
	if (component === "mobile") {
		return parsed.target === "android" && parsed.ext === "apk"
			? "Android APK"
			: fileName;
	}
	if (component === "web") {
		return parsed.target === "dist" && parsed.ext === "tar.gz"
			? "前端 dist"
			: fileName;
	}
	const parts = parsed.target.split("-");
	if (parts.length < 2) return fileName;
	const os = ASSET_OS_LABEL[parts[0]];
	if (!os) return fileName;
	const arch = parts.slice(1).join("-");
	return `${os} ${arch}${parsed.ext ? ` (.${parsed.ext})` : ""}`;
}

/** 列出资产目录中的文件（排除校验和文件本身），并报告校验和是否存在。 */
export function listAssetsDir(assetsDir, tag) {
	const dir = resolve(assetsDir);
	const sumsName = `SHA256SUMS-${tag}.txt`;
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		throw new Error(`--assets-dir not found: ${dir}`);
	}
	const files = [];
	for (const name of entries) {
		if (name === sumsName) continue;
		let stat;
		try {
			stat = statSync(join(dir, name));
		} catch {
			continue;
		}
		if (stat.isFile()) files.push({ name, size: stat.size });
	}
	files.sort((a, b) => a.name.localeCompare(b.name));
	return {
		dir,
		files,
		hasChecksum: existsSync(join(dir, sumsName)),
		sumsName,
	};
}

/** 按真实文件渲染下载表：平台 | 文件 | 大小 | 下载。 */
export function renderAssetsTable(component, version, repo, tag, assetsDir) {
	const { files } = listAssetsDir(assetsDir, tag);
	const lines = ["| 平台 | 文件 | 大小 | 下载 |", "|:---|:---|:---:|:---|"];
	if (files.length === 0) {
		lines.push("| — | 没有找到产物文件 | — | — |");
		return lines.join("\n");
	}
	for (const file of files) {
		lines.push(
			"| " +
				readableAssetLabel(component, version, file.name) +
				" | " +
				code(file.name) +
				" | " +
				formatBytes(file.size) +
				" | [下载](" +
				downloadUrl(repo, tag, file.name) +
				") |",
		);
	}
	return lines.join("\n");
}

function downloadUrl(repo, tag, asset) {
	return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

function renderCell(ext, repo, tag, asset) {
	const mark =
		PLATFORM_BADGE[ext] ??
		badge(ext.toUpperCase() || "BIN", "24292F", "github");
	return `[${mark}](${downloadUrl(repo, tag, asset)})<br>${code(asset)}`;
}

/**
 * 桌面端可下载产物清单。os/arch/ext 与 release.yml 的构建矩阵一一对应，
 * 改矩阵时必须同步这里（单测会校验文件名仍符合命名规范）。
 */
export function desktopArtifacts(version) {
	return [
		{
			platform: "macOS",
			device: "Apple Silicon",
			bestFor: "M 系列 Mac",
			primary: { ext: "dmg", target: "darwin-arm64" },
			alternative: null,
		},
		{
			platform: "macOS",
			device: "Intel",
			bestFor: "Intel 芯片 Mac",
			primary: { ext: "dmg", target: "darwin-amd64" },
			alternative: null,
		},
		{
			platform: "Windows",
			device: "x64",
			bestFor: "64 位 Windows 10 / 11",
			primary: { ext: "exe", target: "windows-amd64" },
			alternative: null,
		},
		{
			platform: "Linux",
			device: "x64",
			bestFor: "Intel / AMD 的 Debian、Ubuntu",
			primary: { ext: "deb", target: "linux-amd64" },
			alternative: { ext: "tar.gz", target: "linux-amd64" },
		},
		{
			platform: "Linux",
			device: "arm64",
			bestFor: "ARM64 服务器与开发板",
			primary: { ext: "deb", target: "linux-arm64" },
			alternative: { ext: "tar.gz", target: "linux-arm64" },
		},
	].map((row) => ({
		...row,
		primaryAsset: artifactForTarget(
			"desktop",
			version,
			row.primary.target,
			row.primary.ext,
		),
		alternativeAsset: row.alternative
			? artifactForTarget(
					"desktop",
					version,
					row.alternative.target,
					row.alternative.ext,
				)
			: null,
	}));
}

/**
 * 服务端可下载产物清单。target 与 release.yml 的构建矩阵一一对应，
 * 改矩阵时必须同步这里（单测会校验文件名仍符合命名规范）。
 */
export function serverArtifacts(version) {
	return [
		{
			os: "Linux",
			arch: "amd64",
			target: "linux-amd64",
			ext: "",
			bestFor: "服务器 / NAS / 虚拟机",
		},
		{
			os: "Linux",
			arch: "arm64",
			target: "linux-arm64",
			ext: "",
			bestFor: "ARM64 服务器与开发板",
		},
		{
			os: "Linux",
			arch: "armv7",
			target: "linux-armv7",
			ext: "",
			bestFor: "树莓派等 32 位 ARM",
		},
		{
			os: "macOS",
			arch: "Apple Silicon",
			target: "darwin-arm64",
			ext: "",
			bestFor: "本机试用 / 开发",
		},
		{
			os: "macOS",
			arch: "Intel",
			target: "darwin-amd64",
			ext: "",
			bestFor: "Intel 芯片 Mac",
		},
		{
			os: "FreeBSD",
			arch: "amd64",
			target: "freebsd-amd64",
			ext: "",
			bestFor: "FreeBSD 服务器",
		},
		{
			os: "FreeBSD",
			arch: "arm64",
			target: "freebsd-arm64",
			ext: "",
			bestFor: "ARM64 FreeBSD",
		},
		{
			os: "OpenBSD",
			arch: "amd64",
			target: "openbsd-amd64",
			ext: "",
			bestFor: "OpenBSD 服务器",
		},
		{
			os: "Windows",
			arch: "x64",
			target: "windows-amd64",
			ext: "exe",
			bestFor: "64 位 Windows",
		},
		{
			os: "Windows",
			arch: "arm64",
			target: "windows-arm64",
			ext: "exe",
			bestFor: "ARM64 Windows",
		},
	].map((row) => ({
		...row,
		asset: artifactForTarget("server", version, row.target, row.ext),
	}));
}

/** 移动端可下载产物：Android APK。 */
export function mobileArtifacts(version) {
	return [
		{
			platform: "Android",
			arch: "universal",
			asset: artifactForTarget("mobile", version, "android", "apk"),
			bestFor: "Android 9 及以上，直接安装",
		},
	];
}

/**
 * Web 端可下载产物：dist 静态站点 tar。
 * 名字必须是 gospeak-web-v<version>-dist.tar.gz（tag 与产物都带 v）。
 */
export function webArtifacts(version) {
	return [
		{
			platform: "Web",
			arch: "静态站点",
			asset: artifactForTarget("web", version, "dist", "tar.gz"),
			bestFor: "解压到任意静态服务器 / CDN",
		},
	];
}

/** 容器镜像地址：ghcr.io/<owner>/<repo>:<version>。 */
export function containerImage(version, repo) {
	return `ghcr.io/${repo.toLowerCase()}:${version}`;
}

/** 容器镜像包页面（docker pull 之外的图形入口）。 */
export function containerPackageUrl(repo) {
	return `https://github.com/${repo}/pkgs/container/gospeak`;
}

/**
 * 桌面端下载表格。tag 是桌面端自己的 Release tag，未传时按版本派生。
 */
export function renderDesktopTable(version, repo, tag) {
	const releaseAnchor = tag ?? releaseTag("desktop", version);
	const rows = desktopArtifacts(version).map((row) => {
		const recommended = renderCell(
			row.primary.ext,
			repo,
			releaseAnchor,
			row.primaryAsset,
		);
		const alternative = row.alternativeAsset
			? "[Portable " +
				row.alternative.ext.toUpperCase() +
				"](" +
				downloadUrl(repo, releaseAnchor, row.alternativeAsset) +
				")"
			: "-";
		return (
			"| **" +
			row.platform +
			"** | " +
			row.device +
			" | " +
			recommended +
			" | " +
			alternative +
			" | " +
			row.bestFor +
			" |"
		);
	});

	return [
		"| 平台 | 架构 | 推荐下载 | 备选 | 适用 |",
		"|:---|:---|:---:|:---|:---|",
		...rows,
	].join("\n");
}

/**
 * 服务端下载表格：每个构建矩阵一行，末尾固定多一行 Docker（镜像不随
 * matrix 变化，放在最后一眼就能看到推荐部署方式）。
 */
export function renderServerTable(version, repo, tag) {
	const releaseAnchor = tag ?? releaseTag("server", version);
	const rows = serverArtifacts(version).map(
		(row) =>
			"| **" +
			row.os +
			"** | " +
			row.arch +
			" | " +
			renderCell(row.ext || "bin", repo, releaseAnchor, row.asset) +
			" | " +
			row.bestFor +
			" |",
	);
	const image = containerImage(version, repo);
	rows.push(
		"| **Docker** | 多架构 | [" +
			code(image) +
			"](" +
			containerPackageUrl(repo) +
			")<br>" +
			code(`docker pull ${image}`) +
			" | 推荐部署方式，免装依赖 |",
	);

	return [
		"| 平台 | 架构 | 下载 | 适用 |",
		"|:---|:---|:---:|:---|",
		...rows,
	].join("\n");
}

/** 移动端下载表格。 */
export function renderMobileTable(version, repo, tag) {
	const releaseAnchor = tag ?? releaseTag("mobile", version);
	const rows = mobileArtifacts(version).map(
		(row) =>
			"| **" +
			row.platform +
			"** | " +
			row.arch +
			" | " +
			renderCell("apk", repo, releaseAnchor, row.asset) +
			" | " +
			row.bestFor +
			" |",
	);
	return [
		"| 平台 | 架构 | 下载 | 适用 |",
		"|:---|:---|:---:|:---|",
		...rows,
	].join("\n");
}

/** Web 端下载表格。 */
export function renderWebTable(version, repo, tag) {
	const releaseAnchor = tag ?? releaseTag("web", version);
	const rows = webArtifacts(version).map(
		(row) =>
			"| **" +
			row.platform +
			"** | " +
			row.arch +
			" | " +
			renderCell("tar.gz", repo, releaseAnchor, row.asset) +
			" | " +
			row.bestFor +
			" |",
	);
	return [
		"| 平台 | 类型 | 下载 | 适用 |",
		"|:---|:---|:---:|:---|",
		...rows,
	].join("\n");
}

function renderDownloadTable(component, version, repo, tag) {
	if (component === "desktop") return renderDesktopTable(version, repo, tag);
	if (component === "mobile") return renderMobileTable(version, repo, tag);
	if (component === "web") return renderWebTable(version, repo, tag);
	return renderServerTable(version, repo, tag);
}

/**
 * 把 --changelog-file 的内容规整成「本版本」的那一段：
 *   - build-changelog --no-write 的原始输出：本身就是本版本段落，原样保留；
 *   - 整个 CHANGELOG.md：截取 ## [<version>] 到下一个 ## 之间；
 *   - 找不到版本段落时原样返回（仍会出现在正文里）。
 */
export function normalizeChangelog(raw, version) {
	const text = String(raw ?? "").trim();
	if (text === "") return "";
	const escaped = String(version).replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
	const heading = new RegExp(`^## \\[?${escaped}\\]?`);
	const lines = text.split("\n");
	const start = lines.findIndex((line) => heading.test(line));
	if (start < 0) return text;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i += 1) {
		if (lines[i].startsWith("## ")) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join("\n").trim();
}

/**
 * 从版本声明 yaml 读取 notes: 块（零依赖，只处理块标量 | 与单行引号写法）。
 * 文件不存在返回空串。
 */
export function readYamlNotes(path) {
	let raw;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return "";
	}
	const lines = raw.split("\n");
	const start = lines.findIndex((line) => /^notes:\s*\|-?\s*$/.test(line));
	if (start >= 0) {
		const block = [];
		for (let i = start + 1; i < lines.length; i += 1) {
			const line = lines[i];
			if (line.trim() === "") {
				block.push("");
				continue;
			}
			if (!/^\s/.test(line)) break;
			block.push(line);
		}
		const indented = block.filter((line) => line.trim() !== "");
		const indent =
			indented.length === 0
				? 0
				: Math.min(...indented.map((line) => line.match(/^\s*/)[0].length));
		return block
			.map((line) => line.slice(indent))
			.join("\n")
			.trim();
	}
	const inline = raw.match(/^notes:\s*["'](.+)["']\s*$/m);
	return inline ? inline[1].trim() : "";
}

/**
 * 按组件渲染 Release 正文：
 *   notes（手写） -> ## 下载 -> ## 更新日志 -> ## 校验
 */
export function renderReleaseBody({
	component,
	version,
	repo,
	tag,
	notes,
	changelog,
	assetsDir,
}) {
	if (!COMPONENTS.includes(component)) {
		throw new Error(
			"unknown component " +
				JSON.stringify(component) +
				'; expected one of "server", "web", "desktop", "mobile"',
		);
	}
	const bodyTag = tag || releaseTag(component, version);
	const sums = checksumName(component, version);
	const bodyNotes = String(notes ?? "").trim();
	const bodyChangelog = String(changelog ?? "").trim();
	// 给了 --assets-dir 就按真实文件渲染，避免写出 404 链接。
	const assetListing =
		assetsDir && String(assetsDir).trim() !== ""
			? listAssetsDir(assetsDir, bodyTag)
			: null;

	const parts = [];
	parts.push(bodyNotes === "" ? "* 本次发布无额外说明。*" : bodyNotes);
	parts.push("");
	parts.push("## 下载");
	parts.push("");
	parts.push(
		assetListing
			? renderAssetsTable(component, version, repo, bodyTag, assetsDir)
			: renderDownloadTable(component, version, repo, bodyTag),
	);
	if (component === "mobile") {
		parts.push("");
		parts.push("- iOS：构建暂未启用。");
	}
	if (component === "desktop") {
		parts.push("");
		parts.push(
			"- macOS 安装包未签名，首次打开如被拦截，去「系统设置 → 隐私与安全性」点「仍要打开」。",
		);
		parts.push("- Linux 优先用 .deb，.tar.gz 为免安装便携包。");
	}
	parts.push("");
	parts.push("## 更新日志");
	parts.push("");
	parts.push(
		bodyChangelog === "" ? "* 本次发布无额外变更记录。*" : bodyChangelog,
	);
	parts.push("");
	if (!assetListing || assetListing.hasChecksum) {
		parts.push("");
		parts.push("## 校验");
		parts.push("");
		parts.push(
			"- 校验和文件：[" +
				code(sums) +
				"](" +
				downloadUrl(repo, bodyTag, sums) +
				")",
		);
		parts.push(
			"- 校验命令：" +
				code(`sha256sum -c ${sums}`) +
				"（macOS 用 " +
				code(`shasum -a 256 -c ${sums}`) +
				"）",
		);
		parts.push("");
	}
	return parts.join("\n");
}

function parseArgs(argv) {
	const [mode, ...rest] = argv;
	const options = { mode, root: process.cwd() };
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i];
		if (!arg.startsWith("--")) {
			throw new Error(`unexpected argument ${JSON.stringify(arg)}`);
		}
		const key = arg.slice(2);
		const value = rest[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`option ${arg} requires a value`);
		}
		options[key] = value;
		i += 1;
	}
	return options;
}

function readTextFile(path, label) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new Error(`${label} not found: ${path}`);
	}
}

function main() {
	try {
		const options = parseArgs(process.argv.slice(2));
		if (options.mode !== "release") {
			throw new Error(
				`mode must be "release", got ${JSON.stringify(options.mode)}`,
			);
		}
		const version = String(options.version ?? "").trim();
		if (version === "") throw new Error("--version is required");
		const repo = String(options.repo ?? "").trim();
		if (repo === "") throw new Error("--repo is required");
		if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
			throw new Error(
				`invalid --repo ${JSON.stringify(repo)}; expected owner/repo`,
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
		const tag = String(options.tag ?? "").trim();
		if (tag === "") throw new Error("--tag is required");
		const expectedTag = releaseTag(component, version);
		const parsed = parseReleaseTag(tag);
		if (
			!parsed ||
			parsed.component !== component ||
			parsed.version !== version
		) {
			throw new Error(
				"--tag " +
					tag +
					" does not match --component " +
					component +
					" --version " +
					version +
					"; expected " +
					expectedTag,
			);
		}

		let assetsDir = "";
		if (options["assets-dir"]) {
			assetsDir = resolve(options["assets-dir"]);
			if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
				throw new Error(`--assets-dir is not a directory: ${assetsDir}`);
			}
		}
		const root = resolve(options.root);
		let notes = "";
		if (options["notes-file"]) {
			notes = readTextFile(options["notes-file"], "notes file");
		} else {
			notes = readYamlNotes(
				resolve(root, `.github/versions/${component}.yaml`),
			);
		}

		let changelog = "";
		if (options["changelog-file"]) {
			changelog = normalizeChangelog(
				readTextFile(options["changelog-file"], "changelog file"),
				version,
			);
		} else {
			const changelogPath = resolve(root, CHANGELOG_PATH_OF[component]);
			if (existsSync(changelogPath)) {
				changelog = normalizeChangelog(
					readFileSync(changelogPath, "utf8"),
					version,
				);
			}
		}

		process.stdout.write(
			`${renderReleaseBody({
				component,
				version,
				repo,
				tag,
				notes,
				changelog,
				assetsDir,
			})}\n`,
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
