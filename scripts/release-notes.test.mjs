import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	containerImage,
	desktopArtifacts,
	releaseTagForVersion,
	renderDesktopTable,
	renderReleaseBody,
	renderServerTable,
	serverArtifacts,
} from "./release-notes.mjs";
import { checksumName } from "./release-naming.mjs";

const SCRIPT = fileURLToPath(new URL("./release-notes.mjs", import.meta.url));
const REPO = "NoelOrin/GOSpeak";

test("desktop artifacts follow the naming convention for every row", () => {
	for (const row of desktopArtifacts("1.0.0")) {
		assert.match(
			row.primaryAsset,
			/^gospeak-desktop-v1\.0\.0-(darwin|windows|linux)-(amd64|arm64)\.(dmg|deb|exe|tar\.gz)$/,
		);
		if (row.alternativeAsset) {
			assert.match(row.alternativeAsset, /^gospeak-desktop-v1\.0\.0-/);
		}
	}
});

test("unified release tag is the server tag", () => {
	assert.equal(
		releaseTagForVersion("1.1.0-rc.1"),
		"gospeak-server-v1.1.0-rc.1",
	);
});

test("server artifacts follow the naming convention and cover every matrix row", () => {
	const rows = serverArtifacts("1.0.0");
	assert.equal(rows.length, 10);
	const targets = rows.map((row) => row.target).join(",");
	for (const target of [
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
	]) {
		assert.ok(targets.includes(target), `missing matrix target ${target}`);
	}
	for (const row of rows) {
		assert.match(
			row.asset,
			/^gospeak-server-v1\.0\.0-(linux|darwin|freebsd|openbsd|windows)-(amd64|arm64|armv7)(\.exe)?$/,
		);
	}
});

test("server table ends with a docker row before the checksum row", () => {
	const table = renderServerTable("1.1.0-rc.1", REPO);
	const lines = table.split("\n");
	const dockerIndex = lines.findIndex((line) => line.includes("**Docker**"));
	const sumsIndex = lines.findIndex((line) => line.includes("**校验和**"));

	assert.ok(dockerIndex > 0, "docker row missing");
	assert.ok(sumsIndex > dockerIndex, "checksum row must come after docker");
	assert.equal(
		sumsIndex,
		lines.length - 1,
		"checksum row must be the last row",
	);

	const image = containerImage("1.1.0-rc.1", REPO);
	assert.equal(image, "ghcr.io/noelorin/gospeak:1.1.0-rc.1");
	assert.ok(
		lines[dockerIndex].includes(image),
		"docker row must name the image",
	);
	assert.ok(
		lines[dockerIndex].includes(`docker pull ${image}`),
		"docker row must show the pull command",
	);
	// 镜像不是文件产物，不能指向 release 的下载直链。
	assert.doesNotMatch(lines[dockerIndex], /releases\/download/);
});

test("release body puts both download tables above the release notes", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: "1.0.0",
		desktopIncluded: true,
		desktopNotes: "桌面端变更内容",
		serverNotes: "服务端变更内容",
	});

	const downloads = body.indexOf("## 下载 GOSpeak");
	const serverTable = body.indexOf("### 服务端");
	const desktopTable = body.indexOf("### 桌面端");
	const desktopNotes = body.indexOf("## 桌面端 release notes");
	const serverNotes = body.indexOf("## 服务端 release notes");
	const divider = body.indexOf("\n---\n");

	assert.ok(downloads >= 0, "downloads section missing");
	assert.ok(serverTable > downloads, "server table must follow the heading");
	assert.ok(
		desktopTable > serverTable,
		"desktop table must follow the server table",
	);
	assert.ok(
		desktopNotes > desktopTable,
		"desktop notes must follow the tables",
	);
	assert.ok(divider > desktopNotes, "divider must follow desktop notes");
	assert.ok(serverNotes > divider, "server notes must be after the divider");
	assert.ok(body.trimEnd().endsWith("服务端变更内容"));
});

test("downloads link to the unified release, not a desktop-only release", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: "1.0.0",
		desktopIncluded: true,
		desktopNotes: "",
		serverNotes: "",
	});

	const tag = releaseTagForVersion("1.0.0");
	for (const row of desktopArtifacts("1.0.0")) {
		const url = `https://github.com/${REPO}/releases/download/${tag}/${row.primaryAsset}`;
		assert.ok(
			body.includes(url),
			`missing download url for ${row.primaryAsset}`,
		);
	}
	for (const row of serverArtifacts("1.0.0")) {
		const url = `https://github.com/${REPO}/releases/download/${tag}/${row.asset}`;
		assert.ok(body.includes(url), `missing download url for ${row.asset}`);
	}
	assert.ok(
		body.includes(
			`/releases/download/${tag}/${checksumName("desktop", "1.0.0")}`,
		),
	);
	assert.ok(
		body.includes(
			`/releases/download/${tag}/${checksumName("server", "1.0.0")}`,
		),
	);
	assert.doesNotMatch(body, /releases\/download\/gospeak-desktop-v/);
});

test("each table only advertises its own artifacts", () => {
	const desktopTable = renderDesktopTable("1.0.0", REPO);
	assert.doesNotMatch(desktopTable, /gospeak-server-v[\d.]+-/);
	assert.match(desktopTable, /gospeak-desktop-v1\.0\.0-darwin-arm64\.dmg/);

	const serverTable = renderServerTable("1.0.0", REPO);
	assert.doesNotMatch(serverTable, /gospeak-desktop-/);
	assert.match(serverTable, /gospeak-server-v1\.0\.0-linux-amd64/);
});

test("release body falls back to the releases page when desktop is absent", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: undefined,
		desktopIncluded: false,
		desktopNotes: "",
		serverNotes: "",
	});

	// 服务端表格与 Docker 行始终在；桌面端退化成 Releases 页链接。
	assert.match(body, /gospeak-server-v1\.0\.0-linux-amd64/);
	assert.match(body, /docker pull ghcr\.io\/noelorin\/gospeak:1\.0\.0/);
	assert.match(body, /https:\/\/github\.com\/NoelOrin\/GOSpeak\/releases\)/);
	assert.doesNotMatch(body, /## 桌面端 release notes/);
});

test("desktop notes are omitted when the desktop did not ship", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: "1.0.0",
		desktopIncluded: false,
		desktopNotes: "桌面端变更内容",
		serverNotes: "服务端变更内容",
	});

	assert.doesNotMatch(body, /## 桌面端 release notes/);
	assert.doesNotMatch(body, /桌面端变更内容/);
});

test("empty server notes degrade to a readable placeholder", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: "1.0.0",
		desktopIncluded: true,
		desktopNotes: "   ",
		serverNotes: "   ",
	});
	assert.match(body, /本次发布无额外说明/);
	assert.doesNotMatch(body, /## 桌面端 release notes/);
});

test("CLI renders a release body and requires --repo", () => {
	const ok = spawnSync(
		process.execPath,
		[SCRIPT, "release", "--version", "1.0.0", "--repo", REPO],
		{ encoding: "utf8" },
	);
	assert.equal(ok.status, 0, ok.stderr);
	assert.match(ok.stdout, /## 下载 GOSpeak/);
	assert.match(ok.stdout, /### 服务端/);
	assert.match(ok.stdout, /docker pull ghcr\.io\/noelorin\/gospeak:1\.0\.0/);
	assert.match(ok.stdout, /## 服务端 release notes/);

	const missing = spawnSync(
		process.execPath,
		[SCRIPT, "release", "--version", "1.0.0"],
		{
			encoding: "utf8",
		},
	);
	assert.equal(missing.status, 1);
	assert.match(missing.stderr, /--repo is required/);

	const wrongMode = spawnSync(
		process.execPath,
		[SCRIPT, "desktop", "--version", "1.0.0", "--repo", REPO],
		{ encoding: "utf8" },
	);
	assert.equal(wrongMode.status, 1);
	assert.match(wrongMode.stderr, /mode must be "release"/);
});
