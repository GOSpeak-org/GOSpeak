import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	androidVersionCode,
	checkMobileVersion,
	findRepoRoot,
	syncMobileVersion,
} from "./mobile-version.mjs";

const SCRIPT = fileURLToPath(new URL("./mobile-version.mjs", import.meta.url));

function write(root, rel, content) {
	const target = join(root, rel);
	mkdirSync(join(target, ".."), { recursive: true });
	writeFileSync(target, content);
}

function createRoot(prefix = "gospeak-mobile-sync-") {
	const root = mkdtempSync(join(tmpdir(), prefix));
	writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - client/*\n");
	mkdirSync(join(root, ".github", "versions"), { recursive: true });
	writeFileSync(
		join(root, ".github", "versions", "mobile.yaml"),
		'version: "2.3.4"\n',
	);
	write(
		root,
		"client/mobile/package.json",
		'{\n  "name": "@gospeak/mobile",\n  "version": "1.0.0"\n}\n',
	);
	write(
		root,
		"client/mobile/android/app/build.gradle",
		'versionCode 1\nversionName "1.0"\n',
	);
	write(
		root,
		"client/mobile/ios/App/App.xcodeproj/project.pbxproj",
		"MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\n",
	);
	return root;
}

test("androidVersionCode derives from semver", () => {
	assert.equal(androidVersionCode("1.0.3"), 10003);
	assert.equal(androidVersionCode("2.14.7"), 21407);
	assert.equal(androidVersionCode("1.4.1"), 10401);
	assert.throws(() => androidVersionCode("oops"), /invalid SemVer/);
});

test("syncMobileVersion writes every derived copy under client/", () => {
	const root = createRoot();
	const result = syncMobileVersion(root);

	assert.deepEqual(result, { version: "2.3.4", code: 20304 });
	assert.match(
		readFileSync(join(root, "client/mobile/package.json"), "utf8"),
		/"version": "2\.3\.4"/,
	);
	const gradle = readFileSync(
		join(root, "client/mobile/android/app/build.gradle"),
		"utf8",
	);
	assert.match(gradle, /versionCode 20304/);
	assert.match(gradle, /versionName "2\.3\.4"/);
	const pbx = readFileSync(
		join(root, "client/mobile/ios/App/App.xcodeproj/project.pbxproj"),
		"utf8",
	);
	assert.match(pbx, /MARKETING_VERSION = 2\.3\.4;/);
	assert.match(pbx, /CURRENT_PROJECT_VERSION = 20304;/);
});

test("checkMobileVersion is clean right after a sync", () => {
	const root = createRoot();
	syncMobileVersion(root);
	assert.deepEqual(checkMobileVersion(root), {
		version: "2.3.4",
		code: 20304,
		drifted: [],
		missing: [],
	});
});

test("checkMobileVersion reports drifted and missing copies", () => {
	const root = createRoot();
	syncMobileVersion(root);
	write(root, "client/mobile/package.json", '{\n  "version": "1.0.0"\n}\n');
	rmSync(join(root, "client/mobile/android/app/build.gradle"));

	const result = checkMobileVersion(root);
	assert.deepEqual(result.drifted, ["client/mobile/package.json"]);
	assert.deepEqual(result.missing, ["client/mobile/android/app/build.gradle"]);
});

test("findRepoRoot walks up to the monorepo root", () => {
	const root = createRoot();
	const nested = join(root, "client", "mobile", "android");
	mkdirSync(nested, { recursive: true });
	assert.equal(findRepoRoot(nested), root);
	assert.equal(findRepoRoot(root), root);
});

test("CLI --check exits 0 when copies match the declaration", () => {
	const root = createRoot();
	syncMobileVersion(root);
	const result = spawnSync(process.execPath, [SCRIPT, "--check"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /mobile version check ok: 2\.3\.4/);
});

test("CLI --check exits 1 and names the drifted file", () => {
	const root = createRoot();
	syncMobileVersion(root);
	write(root, "client/mobile/package.json", '{\n  "version": "1.0.0"\n}\n');
	const result = spawnSync(process.execPath, [SCRIPT, "--check"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /::error::client\/mobile\/package\.json/);
	assert.match(result.stderr, /version drift/);
});

test("CLI finds the root when run from a nested package directory", () => {
	const root = createRoot();
	write(root, "client/mobile/package.json", '{\n  "version": "9.9.9"\n}\n');
	const nested = join(root, "client", "mobile");
	const result = spawnSync(process.execPath, [SCRIPT], {
		cwd: nested,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(
		readFileSync(join(root, "client/mobile/package.json"), "utf8"),
		/"version": "2\.3\.4"/,
	);
});

test("CLI accepts an explicit rootDir", () => {
	const root = createRoot();
	const result = spawnSync(process.execPath, [SCRIPT, root, "--check"], {
		cwd: tmpdir(),
		encoding: "utf8",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /client\/mobile\/package\.json/);
});
