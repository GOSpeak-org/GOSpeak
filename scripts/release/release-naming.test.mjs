import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	RELEASE_COMPONENTS,
	artifactForTarget,
	artifactName,
	artifactUploadName,
	checksumName,
	parseReleaseTag,
	releaseTag,
	tagPrefix,
} from "./release-naming.mjs";

const SCRIPT = fileURLToPath(new URL("./release-naming.mjs", import.meta.url));

function run(...args) {
	return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("component order is the monorepo contract: server, web, desktop, mobile", () => {
	assert.deepEqual(RELEASE_COMPONENTS, ["server", "web", "desktop", "mobile"]);
});

test("tags carry the component and a v prefix", () => {
	assert.equal(releaseTag("server", "1.0.0"), "gospeak-server-v1.0.0");
	assert.equal(releaseTag("web", "1.4.0-rc.1"), "gospeak-web-v1.4.0-rc.1");
	assert.equal(releaseTag("desktop", "1.0.0"), "gospeak-desktop-v1.0.0");
	assert.equal(releaseTag("mobile", "1.2.0"), "gospeak-mobile-v1.2.0");
	assert.equal(tagPrefix("server"), "gospeak-server-v");
	assert.equal(tagPrefix("web"), "gospeak-web-v");
});

test("server artifacts encode the build-matrix target and optional exe", () => {
	assert.equal(
		artifactForTarget("server", "1.4.0-rc.1", "linux-amd64"),
		"gospeak-server-v1.4.0-rc.1-linux-amd64",
	);
	assert.equal(
		artifactForTarget("server", "1.4.0-rc.1", "windows-amd64", ".exe"),
		"gospeak-server-v1.4.0-rc.1-windows-amd64.exe",
	);
	// goarch 对 ARMv7 只是 arm，用 target 才能保住 v7 版本位。
	assert.equal(
		artifactForTarget("server", "1.4.0-rc.1", "linux-armv7"),
		"gospeak-server-v1.4.0-rc.1-linux-armv7",
	);
});

test("desktop artifacts keep os/arch/ext in order", () => {
	assert.equal(
		artifactForTarget("desktop", "1.4.0-rc.1", "darwin-arm64", "dmg"),
		"gospeak-desktop-v1.4.0-rc.1-darwin-arm64.dmg",
	);
	assert.equal(
		artifactForTarget("desktop", "1.4.0-rc.1", "linux-amd64", "deb"),
		"gospeak-desktop-v1.4.0-rc.1-linux-amd64.deb",
	);
	assert.equal(
		artifactForTarget("desktop", "1.4.0-rc.1", "linux-arm64", "tar.gz"),
		"gospeak-desktop-v1.4.0-rc.1-linux-arm64.tar.gz",
	);
	assert.equal(
		artifactForTarget("desktop", "1.4.0-rc.1", "windows-amd64", "exe"),
		"gospeak-desktop-v1.4.0-rc.1-windows-amd64.exe",
	);
});

test("web dist tar always carries v in both tag and asset name", () => {
	const asset = artifactForTarget("web", "1.4.0-rc.1", "dist", "tar.gz");
	assert.equal(asset, "gospeak-web-v1.4.0-rc.1-dist.tar.gz");
	// 旧仓 gospeak-web-<version>-dist.tar.gz（无 v）写法废弃。
	assert.doesNotMatch(asset, /^gospeak-web-\d/);
	assert.equal(
		artifactName("web", "1.4.0-rc.1", "dist", "", "tar.gz"),
		"gospeak-web-v1.4.0-rc.1-dist.tar.gz",
	);
});

test("mobile apk uses the fixed android target", () => {
	assert.equal(
		artifactForTarget("mobile", "1.4.1", "android", "apk"),
		"gospeak-mobile-v1.4.1-android.apk",
	);
});

test("checksum names never collide between components", () => {
	assert.equal(
		checksumName("server", "1.0.0"),
		"SHA256SUMS-gospeak-server-v1.0.0.txt",
	);
	assert.equal(
		checksumName("web", "1.4.0-rc.1"),
		"SHA256SUMS-gospeak-web-v1.4.0-rc.1.txt",
	);
	assert.notEqual(
		checksumName("server", "1.0.0"),
		checksumName("desktop", "1.0.0"),
	);
});

test("parseReleaseTag round-trips every component", () => {
	for (const component of RELEASE_COMPONENTS) {
		assert.deepEqual(parseReleaseTag(releaseTag(component, "2.3.4-rc.1")), {
			component,
			version: "2.3.4-rc.1",
		});
	}
});

test("parseReleaseTag rejects legacy and malformed tags", () => {
	for (const tag of [
		"0.4.0",
		"v0.3.1",
		"desktop-v1.0.0",
		"gospeak-server-1.0.0",
		"gospeak-v1.0.0",
		"",
	]) {
		assert.equal(
			parseReleaseTag(tag),
			null,
			`expected null for ${JSON.stringify(tag)}`,
		);
	}
});

test("upload artifact names stay stable across versions", () => {
	assert.equal(
		artifactUploadName("server", "linux-amd64"),
		"gospeak-server-linux-amd64",
	);
	assert.equal(artifactUploadName("web", "dist"), "gospeak-web-dist");
	assert.equal(
		artifactUploadName("mobile", "android"),
		"gospeak-mobile-android",
	);
});

test("invalid components, versions and empty targets are rejected", () => {
	assert.throws(() => releaseTag("unknown", "1.0.0"), /unknown component/);
	assert.throws(() => releaseTag("server", "dev"), /invalid SemVer/);
	assert.throws(
		() => artifactForTarget("server", "1.0.0", ""),
		/non-empty target/,
	);
	assert.throws(
		() => artifactUploadName("main", "linux-amd64"),
		/unknown component/,
	);
});

test("CLI emits exactly what the module computes", () => {
	const tag = run("tag", "server", "1.4.0-rc.1");
	assert.equal(tag.status, 0, tag.stderr);
	assert.equal(tag.stdout.trim(), "gospeak-server-v1.4.0-rc.1");

	const prefix = run("prefix", "desktop");
	assert.equal(prefix.status, 0, prefix.stderr);
	assert.equal(prefix.stdout.trim(), "gospeak-desktop-v");

	const artifact = run(
		"artifact",
		"desktop",
		"1.4.0-rc.1",
		"darwin",
		"arm64",
		"dmg",
	);
	assert.equal(artifact.status, 0, artifact.stderr);
	assert.equal(
		artifact.stdout.trim(),
		"gospeak-desktop-v1.4.0-rc.1-darwin-arm64.dmg",
	);

	const targeted = run(
		"artifact-target",
		"web",
		"1.4.0-rc.1",
		"dist",
		"tar.gz",
	);
	assert.equal(targeted.status, 0, targeted.stderr);
	assert.equal(targeted.stdout.trim(), "gospeak-web-v1.4.0-rc.1-dist.tar.gz");

	const sums = run("checksum", "mobile", "1.4.1");
	assert.equal(sums.status, 0, sums.stderr);
	assert.equal(sums.stdout.trim(), "SHA256SUMS-gospeak-mobile-v1.4.1.txt");

	const upload = run("upload-name", "server", "linux-amd64");
	assert.equal(upload.status, 0, upload.stderr);
	assert.equal(upload.stdout.trim(), "gospeak-server-linux-amd64");

	const parsed = run("parse", "gospeak-web-v1.4.0-rc.1");
	assert.equal(parsed.status, 0, parsed.stderr);
	assert.equal(parsed.stdout.trim(), "web 1.4.0-rc.1");
});

test("CLI parse fails on legacy tags and unknown subcommands exit 2", () => {
	const legacy = run("parse", "0.4.0");
	assert.equal(legacy.status, 1);
	assert.match(legacy.stderr, /not a release tag/);

	const unknown = run("nope");
	assert.equal(unknown.status, 2);
	assert.match(unknown.stderr, /usage: release-naming.mjs/);

	const badComponent = run("tag", "unknown", "1.0.0");
	assert.equal(badComponent.status, 1);
	assert.match(badComponent.stderr, /::error::unknown component/);
});
