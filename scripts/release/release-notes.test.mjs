import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	desktopArtifacts,
	formatBytes,
	mobileArtifacts,
	normalizeChangelog,
	readYamlNotes,
	readableAssetLabel,
	renderDesktopTable,
	renderReleaseBody,
	renderServerTable,
	serverArtifacts,
	webArtifacts,
} from "./release-notes.mjs";

const SCRIPT = fileURLToPath(new URL("./release-notes.mjs", import.meta.url));
const REPO = "GOSpeak-org/GOSpeak";
const VERSION = "1.4.0-rc.1";

function write(root, rel, content) {
	const target = join(root, rel);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function tmp(prefix = "gospeak-rn-") {
	return mkdtempSync(join(tmpdir(), prefix));
}

function generate(args) {
	return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("desktop artifacts cover every installer row", () => {
	const rows = desktopArtifacts(VERSION);
	assert.equal(rows.length, 5);
	for (const row of rows) {
		assert.match(
			row.primaryAsset,
			/^gospeak-desktop-v1\.4\.0-rc\.1-(darwin|windows|linux)-(amd64|arm64)\.(dmg|deb|exe|tar\.gz)$/,
		);
	}
});

test("server artifacts cover the ten build targets", () => {
	const rows = serverArtifacts(VERSION);
	assert.equal(rows.length, 10);
	for (const row of rows) {
		assert.match(
			row.asset,
			/^gospeak-server-v1\.4\.0-rc\.1-(linux|darwin|freebsd|openbsd|windows)-(amd64|arm64|armv7)(\.exe)?$/,
		);
	}
});

test("mobile and web artifacts use the fixed android/dist assets", () => {
	assert.equal(
		mobileArtifacts(VERSION)[0].asset,
		"gospeak-mobile-v1.4.0-rc.1-android.apk",
	);
	assert.equal(
		webArtifacts(VERSION)[0].asset,
		"gospeak-web-v1.4.0-rc.1-dist.tar.gz",
	);
});

test("release body orders notes, downloads, changelog and checksum", () => {
	const body = renderReleaseBody({
		component: "server",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-server-v1.4.0-rc.1",
		notes: "本次发布说明文本",
		changelog: "## [1.4.0-rc.1](link) (2026-11-28)\n\n### Features\n\n* 新功能",
	});

	const notes = body.indexOf("本次发布说明文本");
	const downloads = body.indexOf("## 下载");
	const changelog = body.indexOf("## 更新日志");
	const checksum = body.indexOf("## 校验");

	assert.ok(notes >= 0, "notes missing");
	assert.ok(downloads > notes, "downloads must follow notes");
	assert.ok(changelog > downloads, "changelog must follow downloads");
	assert.ok(checksum > changelog, "checksum must follow changelog");
	assert.match(body, /gospeak-server-v1\.4\.0-rc\.1-linux-amd64/);
	assert.match(body, /### Features/);
});

test("checksum section names SHA256SUMS-<tag>.txt", () => {
	const body = renderReleaseBody({
		component: "web",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-web-v1.4.0-rc.1",
	});
	assert.match(body, /SHA256SUMS-gospeak-web-v1\.4\.0-rc\.1\.txt/);
	assert.match(
		body,
		/releases\/download\/gospeak-web-v1\.4\.0-rc\.1\/SHA256SUMS-gospeak-web-v1\.4\.0-rc\.1\.txt/,
	);
});

test("each component body only advertises its own artifacts", () => {
	const desktop = renderReleaseBody({
		component: "desktop",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-desktop-v1.4.0-rc.1",
	});
	assert.match(desktop, /gospeak-desktop-v1\.4\.0-rc\.1-darwin-arm64\.dmg/);
	assert.doesNotMatch(desktop, /gospeak-server-v/);
	assert.doesNotMatch(desktop, /docker pull/);

	const server = renderReleaseBody({
		component: "server",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-server-v1.4.0-rc.1",
	});
	assert.match(server, /gospeak-server-v1\.4\.0-rc\.1-linux-amd64/);
	assert.match(
		server,
		/docker pull ghcr\.io\/gospeak-org\/gospeak:1\.4\.0-rc\.1/,
	);
	assert.doesNotMatch(server, /\.dmg/);

	const mobile = renderReleaseBody({
		component: "mobile",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-mobile-v1.4.0-rc.1",
	});
	assert.match(mobile, /gospeak-mobile-v1\.4\.0-rc\.1-android\.apk/);
	assert.match(mobile, /iOS/);

	const web = renderReleaseBody({
		component: "web",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-web-v1.4.0-rc.1",
	});
	assert.match(web, /gospeak-web-v1\.4\.0-rc\.1-dist\.tar\.gz/);
});

test("empty notes and changelog degrade to readable placeholders", () => {
	const body = renderReleaseBody({
		component: "mobile",
		version: VERSION,
		repo: REPO,
		tag: "gospeak-mobile-v1.4.0-rc.1",
		notes: "   ",
		changelog: "",
	});
	assert.match(body, /本次发布无额外说明/);
	assert.match(body, /本次发布无额外变更记录/);
});

test("tables link the given release tag", () => {
	const table = renderDesktopTable(
		VERSION,
		REPO,
		"gospeak-desktop-v1.4.0-rc.1",
	);
	assert.match(
		table,
		/releases\/download\/gospeak-desktop-v1\.4\.0-rc\.1\/gospeak-desktop-v1\.4\.0-rc\.1-darwin-arm64\.dmg/,
	);
	const server = renderServerTable(VERSION, REPO, "gospeak-server-v1.4.0-rc.1");
	assert.match(
		server,
		/releases\/download\/gospeak-server-v1\.4\.0-rc\.1\/gospeak-server-v1\.4\.0-rc\.1-linux-amd64/,
	);
});

test("normalizeChangelog extracts only the requested version from a full changelog", () => {
	const full = [
		"# Changelog / 更新日志",
		"",
		"> 历史说明",
		"",
		"## [1.4.1](https://example.test/compare) (2026-11-28)",
		"",
		"### Features",
		"",
		"* 新条目",
		"",
		"## [1.4.0](https://example.test/compare) (2026-10-01)",
		"",
		"* 旧条目",
		"",
	].join("\n");

	const section = normalizeChangelog(full, "1.4.1");
	assert.match(section, /## \[1\.4\.1\]/);
	assert.match(section, /新条目/);
	assert.doesNotMatch(section, /旧条目/);
	assert.doesNotMatch(section, /# Changelog/);
});

test("normalizeChangelog keeps raw build-changelog output untouched", () => {
	const raw =
		"## [1.4.1](https://example.test/compare) (2026-11-28)\n\n* 无分类变更\n";
	assert.equal(normalizeChangelog(raw, "1.4.1").trim(), raw.trim());
});

test("normalizeChangelog returns input when the version section is absent", () => {
	const raw = "# Changelog\n\n* 只有说明\n";
	assert.equal(normalizeChangelog(raw, "9.9.9"), raw.trim());
});

test("readYamlNotes reads the notes block scalar", () => {
	const root = tmp();
	const file = join(root, "desktop.yaml");
	writeFileSync(
		file,
		[
			'version: "1.4.1"',
			"",
			"notes: |",
			"  桌面端说明。",
			"",
			"  - 条目一",
			"  - 条目二",
			"",
		].join("\n"),
	);
	const notes = readYamlNotes(file);
	assert.match(notes, /^桌面端说明。/);
	assert.match(notes, /- 条目一/);
	assert.doesNotMatch(notes, /^ {2}/);
});

test("readYamlNotes supports inline quoted notes and missing files", () => {
	const root = tmp();
	const inline = join(root, "web.yaml");
	writeFileSync(inline, 'version: "1.0.0"\nnotes: "一行说明"\n');
	assert.equal(readYamlNotes(inline), "一行说明");

	assert.equal(readYamlNotes(join(root, "missing.yaml")), "");

	const none = join(root, "mobile.yaml");
	writeFileSync(none, 'version: "1.0.0"\n');
	assert.equal(readYamlNotes(none), "");
});

test("CLI reads the component yaml notes by default", () => {
	const root = tmp();
	write(
		root,
		".github/versions/web.yaml",
		[
			'version: "9.9.9"',
			"",
			"notes: |",
			"  Web 9.9.9 说明。",
			"",
			"  - 第一条",
			"",
		].join("\n"),
	);
	const result = generate([
		"release",
		"--component",
		"web",
		"--version",
		"9.9.9",
		"--tag",
		"gospeak-web-v9.9.9",
		"--repo",
		REPO,
		"--root",
		root,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Web 9\.9\.9 说明。/);
	assert.match(result.stdout, /gospeak-web-v9\.9\.9-dist\.tar\.gz/);
});

test("--notes-file wins over the yaml notes and --changelog-file feeds the changelog section", () => {
	const root = tmp();
	write(
		root,
		".github/versions/server.yaml",
		'version: "9.9.9"\n\nnotes: |\n  yaml 说明\n',
	);
	const notesFile = join(root, "notes.md");
	writeFileSync(notesFile, "手写 notes 内容\n");
	const changelogFile = join(root, "changelog.md");
	writeFileSync(
		changelogFile,
		[
			"# Changelog / 更新日志",
			"",
			"## [9.9.9](https://example.test/compare) (2026-11-28)",
			"",
			"### Features",
			"",
			"* 本版本条目",
			"",
			"## [9.9.8](https://example.test/compare) (2026-11-01)",
			"",
			"* 上一版本条目",
			"",
		].join("\n"),
	);

	const result = generate([
		"release",
		"--component",
		"server",
		"--version",
		"9.9.9",
		"--tag",
		"gospeak-server-v9.9.9",
		"--repo",
		REPO,
		"--root",
		root,
		"--notes-file",
		notesFile,
		"--changelog-file",
		changelogFile,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /手写 notes 内容/);
	assert.doesNotMatch(result.stdout, /yaml 说明/);
	assert.match(result.stdout, /本版本条目/);
	assert.doesNotMatch(result.stdout, /上一版本条目/);
});

test("CLI rejects mismatched tags, missing flags and unknown components", () => {
	const mismatch = generate([
		"release",
		"--component",
		"web",
		"--version",
		"9.9.9",
		"--tag",
		"gospeak-server-v9.9.9",
		"--repo",
		REPO,
	]);
	assert.equal(mismatch.status, 1);
	assert.match(mismatch.stderr, /does not match --component web/);
	assert.match(mismatch.stderr, /expected gospeak-web-v9\.9\.9/);

	const missingRepo = generate([
		"release",
		"--component",
		"web",
		"--version",
		"9.9.9",
		"--tag",
		"gospeak-web-v9.9.9",
	]);
	assert.equal(missingRepo.status, 1);
	assert.match(missingRepo.stderr, /--repo is required/);

	const missingVersion = generate([
		"release",
		"--component",
		"web",
		"--tag",
		"gospeak-web-v9.9.9",
		"--repo",
		REPO,
	]);
	assert.equal(missingVersion.status, 1);
	assert.match(missingVersion.stderr, /--version is required/);

	const unknownComponent = generate([
		"release",
		"--component",
		"cli",
		"--version",
		"9.9.9",
		"--tag",
		"gospeak-cli-v9.9.9",
		"--repo",
		REPO,
	]);
	assert.equal(unknownComponent.status, 1);
	assert.match(unknownComponent.stderr, /unknown --component/);

	const badMode = generate([
		"desktop",
		"--component",
		"web",
		"--version",
		"9.9.9",
		"--tag",
		"gospeak-web-v9.9.9",
		"--repo",
		REPO,
	]);
	assert.equal(badMode.status, 1);
	assert.match(badMode.stderr, /mode must be "release"/);
});

test("formatBytes renders human readable sizes", () => {
	assert.equal(formatBytes(0), "0 B");
	assert.equal(formatBytes(3), "3 B");
	assert.equal(formatBytes(1536), "1.5 KB");
	assert.equal(formatBytes(11744052), "11.2 MB");
});

test("readableAssetLabel maps known artifacts and keeps unknown names", () => {
	assert.equal(
		readableAssetLabel(
			"desktop",
			VERSION,
			"gospeak-desktop-v1.4.0-rc.1-linux-amd64",
		),
		"Linux amd64",
	);
	assert.equal(
		readableAssetLabel(
			"desktop",
			VERSION,
			"gospeak-desktop-v1.4.0-rc.1-darwin-arm64.dmg",
		),
		"macOS arm64 (.dmg)",
	);
	assert.equal(
		readableAssetLabel(
			"desktop",
			VERSION,
			"gospeak-desktop-v1.4.0-rc.1-windows-amd64.exe",
		),
		"Windows amd64 (.exe)",
	);
	assert.equal(
		readableAssetLabel(
			"desktop",
			VERSION,
			"gospeak-desktop-v1.4.0-rc.1-linux-amd64.deb",
		),
		"Linux amd64 (.deb)",
	);
	assert.equal(
		readableAssetLabel(
			"mobile",
			VERSION,
			"gospeak-mobile-v1.4.0-rc.1-android.apk",
		),
		"Android APK",
	);
	assert.equal(
		readableAssetLabel("web", VERSION, "gospeak-web-v1.4.0-rc.1-dist.tar.gz"),
		"前端 dist",
	);
	assert.equal(
		readableAssetLabel(
			"server",
			VERSION,
			"gospeak-server-v1.4.0-rc.1-linux-armv7",
		),
		"Linux armv7",
	);
	assert.equal(
		readableAssetLabel("desktop", VERSION, "mystery.bin"),
		"mystery.bin",
	);
});

test("--assets-dir renders only files that actually exist", () => {
	const root = tmp("gospeak-rn-assets-");
	const assets = join(root, "assets");
	mkdirSync(assets, { recursive: true });
	writeFileSync(
		join(assets, "gospeak-desktop-v1.4.0-rc.1-darwin-arm64.dmg"),
		Buffer.alloc(11744052),
	);
	writeFileSync(
		join(assets, "gospeak-desktop-v1.4.0-rc.1-linux-amd64"),
		"binary",
	);
	writeFileSync(join(assets, "mystery.bin"), "x");

	const result = generate([
		"release",
		"--component",
		"desktop",
		"--version",
		VERSION,
		"--tag",
		"gospeak-desktop-v1.4.0-rc.1",
		"--repo",
		REPO,
		"--root",
		root,
		"--assets-dir",
		assets,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /\| 平台 \| 文件 \| 大小 \| 下载 \|/);
	assert.match(result.stdout, /macOS arm64 \(\.dmg\)/);
	assert.match(result.stdout, /Linux amd64/);
	assert.match(result.stdout, /11\.2 MB/);
	assert.match(result.stdout, /mystery\.bin/);
	// 预期清单里有、但目录里没有产出的平台不得出现（否则就是 404 死链）
	assert.doesNotMatch(result.stdout, /darwin-amd64/);
	assert.doesNotMatch(result.stdout, /linux-arm64/);
	// 目录里没有 SHA256SUMS-<tag>.txt -> 整个校验段省略
	assert.doesNotMatch(result.stdout, /## 校验/);
});

test("--assets-dir keeps the checksum section when the sums file exists", () => {
	const root = tmp("gospeak-rn-assets-");
	const assets = join(root, "assets");
	mkdirSync(assets, { recursive: true });
	writeFileSync(
		join(assets, "gospeak-mobile-v1.4.0-rc.1-android.apk"),
		Buffer.alloc(2048),
	);
	writeFileSync(
		join(assets, "SHA256SUMS-gospeak-mobile-v1.4.0-rc.1.txt"),
		"checksum",
	);

	const result = generate([
		"release",
		"--component",
		"mobile",
		"--version",
		VERSION,
		"--tag",
		"gospeak-mobile-v1.4.0-rc.1",
		"--repo",
		REPO,
		"--root",
		root,
		"--assets-dir",
		assets,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Android APK/);
	assert.match(result.stdout, /## 校验/);
	assert.match(result.stdout, /SHA256SUMS-gospeak-mobile-v1\.4\.0-rc\.1\.txt/);
});

test("without --assets-dir the expected platform table is kept", () => {
	const root = tmp("gospeak-rn-assets-");
	const result = generate([
		"release",
		"--component",
		"mobile",
		"--version",
		VERSION,
		"--tag",
		"gospeak-mobile-v1.4.0-rc.1",
		"--repo",
		REPO,
		"--root",
		root,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /gospeak-mobile-v1\.4\.0-rc\.1-android\.apk/);
	assert.match(result.stdout, /## 校验/);
	assert.doesNotMatch(result.stdout, /\| 平台 \| 文件 \| 大小 \| 下载 \|/);
});

test("--assets-dir rejects a missing directory", () => {
	const root = tmp("gospeak-rn-assets-");
	const result = generate([
		"release",
		"--component",
		"desktop",
		"--version",
		VERSION,
		"--tag",
		"gospeak-desktop-v1.4.0-rc.1",
		"--repo",
		REPO,
		"--root",
		root,
		"--assets-dir",
		join(root, "missing"),
	]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /--assets-dir is not a directory/);
});
