import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { androidVersionCode, checkVersionState } from "./check-version.mjs";

function fixture(component, version) {
	const root = mkdtempSync(join(tmpdir(), "gospeak-ver-"));
	mkdirSync(join(root, ".github", "versions"), { recursive: true });
	writeFileSync(
		join(root, ".github", "versions", `${component}.yaml`),
		`version: "${version}"\n`,
	);
	return root;
}

test("androidVersionCode", () => {
	assert.equal(androidVersionCode("1.4.0-rc.1"), 10400);
	assert.equal(androidVersionCode("1.0.3"), 10003);
});

test("server version matches submodule VERSION", () => {
	const root = fixture("server", "1.3.0-rc.1");
	mkdirSync(join(root, "server"), { recursive: true });
	writeFileSync(join(root, "server", "VERSION"), "1.3.0-rc.1\n");
	const state = checkVersionState(root, "", "server");
	assert.deepEqual(state.issues, []);
});

test("server version mismatch reports issue", () => {
	const root = fixture("server", "1.3.0-rc.1");
	mkdirSync(join(root, "server"), { recursive: true });
	writeFileSync(join(root, "server", "VERSION"), "1.2.0\n");
	const state = checkVersionState(root, "", "server");
	assert.equal(state.issues.length, 1);
});

test("web package version must match declaration", () => {
	const root = fixture("web", "1.4.0-rc.1");
	mkdirSync(join(root, "client", "web"), { recursive: true });
	writeFileSync(
		join(root, "client", "web", "package.json"),
		'{"version":"1.4.0-rc.1"}',
	);
	assert.deepEqual(checkVersionState(root, "", "web").issues, []);
	writeFileSync(
		join(root, "client", "web", "package.json"),
		'{"version":"1.3.0"}',
	);
	assert.equal(checkVersionState(root, "", "web").issues.length, 1);
});
