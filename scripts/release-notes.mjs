#!/usr/bin/env node
// GitHub Release 正文生成器 —— 一版一个 Release（对齐 SyncTV 的发布页形态）。
//
// 版本对应的**唯一** Release 挂在 `gospeak-server-v<version>` tag 上，服务端
// 二进制与桌面端安装包都作为附件进入同一个 Release：
//
//   1. 正文顶部是「桌面端下载表格」：用户点一下就拿到 dmg / deb / exe
//   2. 中间是桌面端安装说明与部署指引
//   3. 分隔线之后依次是桌面端、服务端的 release notes
//
// 桌面端 tag（`gospeak-desktop-v<version>`）仍然存在，但只承担构建触发与版本
// 门禁，不再单独创建 Release —— 否则 Releases 页会为同一版本出现两条同名条目。
//
// 所有产物名由 scripts/release-naming.mjs 派生，本文件不手拼文件名。
//
// 用法：
//   node scripts/release-notes.mjs release --version 1.0.0 --repo o/r \
//        [--desktop-version 1.0.0] [--desktop-included] \
//        [--notes-file server-notes.md] [--desktop-notes-file desktop-notes.md]
//
// 输出写到 stdout。

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
	artifactForTarget,
	checksumName,
	releaseTag,
} from "./release-naming.mjs";

const BADGE = (label, color, logo) =>
	`![Download ${label}](https://img.shields.io/badge/Download-${label}-${color}?style=for-the-badge&logo=${logo}&logoColor=white)`;

const PLATFORM_BADGE = {
	dmg: BADGE("DMG", "000000", "apple"),
	deb: BADGE("DEB", "FCC624", "linux"),
	exe: BADGE("EXE", "0078D4", "windows11"),
};

function downloadUrl(repo, tag, asset) {
	return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

/** 本版本的统一 Release tag：服务端 tag 承载两端产物。 */
export function releaseTagForVersion(version) {
	return releaseTag("server", version);
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

function renderCell(ext, repo, tag, asset) {
	const badge =
		PLATFORM_BADGE[ext] ?? BADGE(ext.toUpperCase(), "24292F", "github");
	return `[${badge}](${downloadUrl(repo, tag, asset)})<br>\`${asset}\``;
}

/** 通用下载链接（无徽章，用于 Docker 这类非文件产物）。 */
function renderTextCell(label, href) {
	return href ? `[${label}](${href})` : label;
}

function renderChecksumCell(repo, tag, sums) {
	return `[${BADGE("SHA-256", "24292F", "github")}](${downloadUrl(repo, tag, sums)})<br>\`${sums}\``;
}

/**
 * 桌面端下载表格（Markdown）。
 *
 * `tag` 默认是本版本的统一 Release（服务端 tag）；桌面端安装包与校验和都在
 * 同一个 Release 的 Assets 里，因此下载直链必须指向它，而不是桌面端 tag。
 */
export function renderDesktopTable(version, repo, tag) {
	const releaseAnchor = tag ?? releaseTagForVersion(version);
	const rows = desktopArtifacts(version).map((row) => {
		const recommended = renderCell(
			row.primary.ext,
			repo,
			releaseAnchor,
			row.primaryAsset,
		);
		const alternative = row.alternativeAsset
			? `[Portable ${row.alternative.ext.toUpperCase()}](${downloadUrl(repo, releaseAnchor, row.alternativeAsset)})`
			: "-";
		return `| **${row.platform}** | ${row.device} | ${recommended} | ${alternative} | ${row.bestFor} |`;
	});

	const sums = checksumName("desktop", version);
	rows.push(
		`| **校验和** | 全部文件 | ${renderChecksumCell(repo, releaseAnchor, sums)} | - | 完整性校验 |`,
	);

	return [
		"| 平台 | 架构 | 推荐下载 | 备选 | 适用 |",
		"|:---|:---|:---:|:---|:---|",
		...rows,
	].join("\n");
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

/** 容器镜像地址：ghcr.io/<owner>/<repo>:<version>。 */
export function containerImage(version, repo) {
	return `ghcr.io/${repo.toLowerCase()}:${version}`;
}

/** 容器镜像包页面（docker pull 之外的图形入口）。 */
export function containerPackageUrl(repo) {
	return `https://github.com/${repo}/pkgs/container/gospeak`;
}

/**
 * 服务端下载表格：每个构建矩阵一行，末尾固定多一行 Docker（镜像不随
 * matrix 变化，放在最后一眼就能看到推荐部署方式）。
 */
export function renderServerTable(version, repo, tag) {
	const releaseAnchor = tag ?? releaseTagForVersion(version);
	const rows = serverArtifacts(version).map(
		(row) =>
			`| **${row.os}** | ${row.arch} | ${renderCell(row.ext || "bin", repo, releaseAnchor, row.asset)} | ${row.bestFor} |`,
	);

	const image = containerImage(version, repo);
	rows.push(
		`| **Docker** | 多架构 | ${renderTextCell(`\`${image}\``, containerPackageUrl(repo))}<br>\`docker pull ${image}\` | 推荐部署方式，免装依赖 |`,
	);

	const sums = checksumName("server", version);
	rows.push(
		`| **校验和** | 全部文件 | ${renderChecksumCell(repo, releaseAnchor, sums)} | 完整性校验 |`,
	);

	return [
		"| 平台 | 架构 | 下载 | 适用 |",
		"|:---|:---|:---:|:---|",
		...rows,
	].join("\n");
}

function renderInstallNotes() {
	return [
		"### 安装说明",
		"",
		"- macOS 分 Apple Silicon 与 Intel 两个版本，下错架构打不开。",
		"- macOS 安装包未签名，首次打开如被拦截，去「系统设置 → 隐私与安全性」点「仍要打开」。",
		"- Windows 提供 EXE 安装包，双击安装。",
		"- Linux 优先用 `.deb`（双击即装），`.tar.gz` 为免安装便携包。",
		"- `SHA256SUMS` 文件可用于校验下载完整性。",
	].join("\n");
}

function renderDeploySection(repo, tag, version) {
	return [
		"## 部署 GOSpeak 服务端",
		"",
		`- **Docker Compose**（推荐）：[在服务器 / NAS / 虚拟机上部署](https://github.com/${repo}/blob/${tag}/deploy/DEPLOY.md)`,
		`- **容器镜像**：\`docker pull ${containerImage(version, repo)}\`，多架构自动匹配`,
		"- **二进制**：见上方服务端下载表格，下载后 `chmod +x` 直接运行 `./gospeak-server-* server -e prod`",
		"",
		`[浏览 ${tag} 的部署文档](https://github.com/${repo}/tree/${tag}/deploy)`,
	].join("\n");
}

/**
 * 统一 Release 正文：服务端下载表格（含 Docker 行）→ 桌面端下载表格 →
 * 安装说明 → 桌面端 notes → 分隔线 → 服务端 notes。
 *
 * 两个表格都在顶部：普通用户先看到客户端，运维先看到服务端二进制与镜像。
 * desktopIncluded=false（本版本没有桌面端产物）时桌面端表格换成 Releases 页
 * 链接，避免指向并不存在的附件造成 404。
 */
export function renderReleaseBody({
	version,
	repo,
	desktopVersion,
	desktopIncluded,
	desktopNotes,
	serverNotes,
}) {
	const tag = releaseTagForVersion(version);
	const parts = [];

	parts.push("## 下载 GOSpeak");
	parts.push("");
	parts.push("> [!TIP]");
	parts.push(
		`> 本版本的服务端二进制、容器镜像与桌面端安装包同属 ${tag}，无需另找发布页。`,
	);
	parts.push("");

	parts.push("### 服务端");
	parts.push("");
	parts.push(renderServerTable(version, repo, tag));
	parts.push("");

	parts.push("### 桌面端");
	parts.push("");
	if (desktopIncluded && desktopVersion) {
		parts.push(renderDesktopTable(desktopVersion, repo, tag));
	} else {
		parts.push(
			`桌面端安装包见 [Releases](https://github.com/${repo}/releases) 页面中 \`gospeak-desktop-\` 前缀的产物。`,
		);
	}
	parts.push("");
	parts.push(renderInstallNotes());
	parts.push("");
	parts.push(renderDeploySection(repo, tag, version));

	if (desktopIncluded && (desktopNotes ?? "").trim()) {
		parts.push("");
		parts.push("## 桌面端 release notes");
		parts.push("");
		parts.push(desktopNotes.trim());
	}

	parts.push("");
	parts.push("---");
	parts.push("");
	parts.push("## 服务端 release notes");
	parts.push("");
	parts.push((serverNotes ?? "").trim() || "* 本次发布无额外说明。");
	parts.push("");

	return parts.join("\n");
}

function parseArgs(argv) {
	const [mode, ...rest] = argv;
	const options = { mode };
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		if (key === "desktop-included") {
			options.desktopIncluded = true;
			continue;
		}
		const value = rest[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`option --${key} requires a value`);
		}
		options[key] = value;
		i += 1;
	}
	return options;
}

function readNotes(path) {
	if (!path) return "";
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const { mode, version, repo } = options;
	if (mode !== "release") {
		throw new Error(`mode must be "release", got ${JSON.stringify(mode)}`);
	}
	if (!version) throw new Error("--version is required");
	if (!repo) throw new Error("--repo is required");

	const body = renderReleaseBody({
		version,
		repo,
		desktopVersion: options["desktop-version"],
		desktopIncluded: options.desktopIncluded === true,
		desktopNotes: readNotes(options["desktop-notes-file"]),
		serverNotes: readNotes(options["notes-file"]),
	});

	process.stdout.write(body);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		main();
	} catch (err) {
		process.stderr.write(
			`::error::${err instanceof Error ? err.message : err}\n`,
		);
		process.exitCode = 1;
	}
}
