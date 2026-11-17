import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	desktopArtifacts,
	releaseTagForVersion,
	renderDesktopTable,
	renderReleaseBody,
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

test("release body puts desktop downloads above the release notes", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: "1.0.0",
		desktopIncluded: true,
		desktopNotes: "桌面端变更内容",
		serverNotes: "服务端变更内容",
	});

	const downloads = body.indexOf("## 下载 GOSpeak 桌面端");
	const desktopNotes = body.indexOf("## 桌面端 release notes");
	const serverNotes = body.indexOf("## 服务端 release notes");
	const divider = body.indexOf("\n---\n");

	assert.ok(downloads >= 0, "downloads section missing");
	assert.ok(desktopNotes > downloads, "desktop notes must follow downloads");
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
	assert.ok(
		body.includes(
			`/releases/download/${tag}/${checksumName("desktop", "1.0.0")}`,
		),
	);
	assert.doesNotMatch(body, /releases\/download\/gospeak-desktop-v/);
});

test("release body never advertises server binaries in the download table", () => {
	const body = renderReleaseBody({
		version: "1.0.0",
		repo: REPO,
		desktopVersion: "1.0.0",
		desktopIncluded: true,
		desktopNotes: "",
		serverNotes: "",
	});

	const table = renderDesktopTable("1.0.0", REPO);
	// 下载直链的 tag 是 gospeak-server-v<version>（统一 Release），
	// 但表格里的文件名一律是 gospeak-desktop-*，不放服务端二进制。
	assert.doesNotMatch(table, /gospeak-server-v[\d.]+-/);
	assert.match(table, /gospeak-desktop-v1\.0\.0-darwin-arm64\.dmg/);
	assert.doesNotMatch(body, /releases\/download\/[^)\s]*\/gospeak-server-/);
	assert.match(body, /Assets 列表/);
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

	assert.match(body, /https:\/\/github\.com\/NoelOrin\/GOSpeak\/releases\)/);
	assert.doesNotMatch(body, /releases\/download/);
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
	assert.match(ok.stdout, /## 下载 GOSpeak 桌面端/);
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
