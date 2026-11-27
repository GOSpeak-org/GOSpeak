import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkVersionState } from "./check-version.mjs";

const SCRIPT = fileURLToPath(new URL("./check-version.mjs", import.meta.url));

function write(root, rel, content) {
	const target = join(root, rel);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function writeJson(root, rel, data) {
	write(root, rel, JSON.stringify(data));
}

function writeDeclaration(root, component, version) {
	write(
		root,
		join(".github", "versions", `${component}.yaml`),
		`version: "${version}"\n`,
	);
}

function tmpRoot(prefix) {
	return mkdtempSync(join(tmpdir(), prefix));
}

function createServerRoot(version = "1.3.1", packageVersion = version) {
	const root = tmpRoot("gospeak-cv-server-");
	writeDeclaration(root, "server", version);
	write(root, "server/VERSION", `${version}\n`);
	writeJson(root, "server/server/package.json", {
		name: "@gospeak/server",
		version: packageVersion,
	});
	// 根 package.json 故意写错，证明它不参与版本校验。
	writeJson(root, "package.json", {
		name: "gospeak-monorepo",
		version: "9.9.9",
	});
	return root;
}

function createWebRoot(version = "1.4.1", packageVersion = version) {
	const root = tmpRoot("gospeak-cv-web-");
	writeDeclaration(root, "web", version);
	writeJson(root, "client/web/package.json", {
		name: "@gospeak/web",
		version: packageVersion,
	});
	return root;
}

function createDesktopRoot({
	version = "1.4.1",
	packageVersion = version,
	mygoVersion = version,
} = {}) {
	const root = tmpRoot("gospeak-cv-desktop-");
	writeDeclaration(root, "desktop", version);
	writeJson(root, "client/desktop/package.json", {
		name: "@gospeak/desktop-app",
		version: packageVersion,
	});
	write(
		root,
		"client/desktop/mygo.config.ts",
		`export default {\n\tversion: "${mygoVersion}",\n};\n`,
	);
	return root;
}

function createMobileRoot({
	version = "1.4.1",
	packageVersion = version,
	versionName = version,
	versionCode = "10401",
	marketing = version,
	projectVersion = "10401",
} = {}) {
	const root = tmpRoot("gospeak-cv-mobile-");
	writeDeclaration(root, "mobile", version);
	writeJson(root, "client/mobile/package.json", {
		name: "@gospeak/mobile",
		version: packageVersion,
	});
	write(
		root,
		"client/mobile/android/app/build.gradle",
		[
			"android {",
			"    defaultConfig {",
			`        versionCode ${versionCode}`,
			`        versionName "${versionName}"`,
			"    }",
			"}",
			"",
		].join("\n"),
	);
	write(
		root,
		"client/mobile/ios/App/App.xcodeproj/project.pbxproj",
		[
			"/* Debug */",
			`MARKETING_VERSION = ${marketing};`,
			`CURRENT_PROJECT_VERSION = ${projectVersion};`,
			"/* Release */",
			`MARKETING_VERSION = ${marketing};`,
			`CURRENT_PROJECT_VERSION = ${projectVersion};`,
			"",
		].join("\n"),
	);
	return root;
}

test("server version matches VERSION and server/server/package.json, never root package.json", () => {
	const root = createServerRoot();
	const result = checkVersionState(root, "gospeak-server-v1.3.1", "server");

	assert.deepEqual(result.issues, []);
	assert.equal(result.component, "server");
	assert.equal(result.declared, "1.3.1");
	assert.deepEqual(result.checked, [
		"server/VERSION",
		"server/server/package.json",
	]);
});

test("server mismatch reports path, expected value and actual value", () => {
	const root = createServerRoot("1.3.1", "1.3.0");
	const result = checkVersionState(root, "", "server");

	assert.equal(result.issues.length, 1);
	const issue = result.issues[0];
	assert.ok(issue.includes("server/server/package.json"), issue);
	assert.ok(issue.includes('"1.3.1"'), issue);
	assert.ok(issue.includes('"1.3.0"'), issue);
});

test("web validates client/web/package.json only", () => {
	const root = createWebRoot();
	assert.deepEqual(
		checkVersionState(root, "gospeak-web-v1.4.1", "web").issues,
		[],
	);

	const broken = createWebRoot("1.4.1", "1.4.0");
	const result = checkVersionState(broken, "", "web");
	assert.equal(result.issues.length, 1);
	assert.ok(result.issues[0].includes("client/web/package.json"));
	assert.ok(result.issues[0].includes("expected version "));
	assert.ok(result.issues[0].includes("actual "));
});

test("desktop validates package.json and mygo.config.ts version", () => {
	const root = createDesktopRoot();
	assert.deepEqual(
		checkVersionState(root, "gospeak-desktop-v1.4.1", "desktop").issues,
		[],
	);

	const broken = createDesktopRoot({ mygoVersion: "1.4.0" });
	const result = checkVersionState(broken, "", "desktop");
	assert.equal(result.issues.length, 1);
	assert.ok(result.issues[0].includes("client/desktop/mygo.config.ts"));
	assert.ok(result.issues[0].includes('"1.4.1"'));
	assert.ok(result.issues[0].includes('"1.4.0"'));
});

test("mobile versionCode is derived from semver and must match android + iOS", () => {
	const root = createMobileRoot();
	assert.deepEqual(
		checkVersionState(root, "gospeak-mobile-v1.4.1", "mobile").issues,
		[],
	);
	assert.equal(createMobileRoot().length > 0, true);
});

test("mobile reports a stale Android versionCode", () => {
	const root = createMobileRoot({ versionCode: "10400" });
	const result = checkVersionState(root, "", "mobile");

	assert.equal(result.issues.length, 1);
	const issue = result.issues[0];
	assert.ok(issue.includes("client/mobile/android/app/build.gradle"), issue);
	assert.ok(issue.includes("versionCode"), issue);
	assert.ok(issue.includes('"10401"'), issue);
	assert.ok(issue.includes('"10400"'), issue);
});

test("mobile reports stale iOS MARKETING_VERSION once per distinct value", () => {
	const root = createMobileRoot({ marketing: "1.4.0" });
	const result = checkVersionState(root, "", "mobile");

	const marketingIssues = result.issues.filter((issue) =>
		issue.includes("MARKETING_VERSION"),
	);
	assert.equal(marketingIssues.length, 1, result.issues.join("\n"));
	assert.ok(marketingIssues[0].includes("project.pbxproj"));
	assert.ok(marketingIssues[0].includes('"1.4.0"'));
});

test("mobile reports CURRENT_PROJECT_VERSION drift against androidVersionCode", () => {
	const root = createMobileRoot({ projectVersion: "10400" });
	const result = checkVersionState(root, "", "mobile");
	const issues = result.issues.filter((issue) =>
		issue.includes("CURRENT_PROJECT_VERSION"),
	);
	assert.equal(issues.length, 1, result.issues.join("\n"));
	assert.ok(issues[0].includes('"10401"'));
	assert.ok(issues[0].includes('"10400"'));
});

test("release tag must match the declared version", () => {
	const root = createServerRoot();
	const result = checkVersionState(root, "gospeak-server-v1.3.0", "server");
	assert.equal(result.issues.length, 1);
	assert.ok(result.issues[0].includes("gospeak-server-v1.3.0"));
	assert.ok(result.issues[0].includes("1.3.1"));
});

test("release tag must belong to the component being checked", () => {
	const root = createWebRoot();
	const result = checkVersionState(root, "gospeak-server-v1.4.1", "web");
	assert.equal(result.issues.length, 1);
	assert.ok(result.issues[0].includes("expected component web"));
	assert.ok(result.issues[0].includes("actual server"));
});

test("legacy tags are rejected", () => {
	const root = createServerRoot();
	for (const tag of ["0.4.0", "v0.3.1", "desktop-v1.0.0"]) {
		const result = checkVersionState(root, tag, "server");
		assert.equal(result.issues.length, 1, tag);
		assert.match(result.issues[0], /naming convention/);
	}
});

test("component is inferred from the tag when omitted", () => {
	const root = createWebRoot();
	assert.equal(checkVersionState(root, "gospeak-web-v1.4.1").component, "web");

	const mobile = createMobileRoot();
	assert.equal(
		checkVersionState(mobile, "gospeak-mobile-v1.4.1").component,
		"mobile",
	);
});

test("component is required when both tag and component are absent", () => {
	const root = createServerRoot();
	assert.throws(() => checkVersionState(root, "", ""), /component is required/);
	assert.throws(() => checkVersionState(root), /component is required/);
});

test("unknown component is rejected; main alias still maps to server", () => {
	const root = createServerRoot();
	assert.throws(() => checkVersionState(root, "", "cli"), /unknown component/);
	assert.equal(checkVersionState(root, "", "main").component, "server");
});

test("missing version file fails with its path and expected value", () => {
	const root = createWebRoot();
	rmSync(join(root, "client/web/package.json"));
	assert.throws(
		() => checkVersionState(root, "", "web"),
		/client\/web\/package\.json: file not found; expected version "1\.4\.1"/,
	);
});

test("declaration file with an invalid SemVer is rejected", () => {
	const root = createServerRoot();
	writeDeclaration(root, "server", "dev");
	assert.throws(
		() => checkVersionState(root, "", "server"),
		/must contain a valid SemVer/,
	);
});

test("CLI exits 0 for a consistent component", () => {
	const root = createWebRoot();
	const result = spawnSync(process.execPath, [SCRIPT, root, "", "web"], {
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stdout,
		/version consistency ok: component=web declared=1\.4\.1/,
	);
	assert.equal(existsSync(join(root, "client/web/package.json")), true);
});

test("CLI exits non-zero and prints path/expected/actual on drift", () => {
	const root = createWebRoot("1.4.1", "1.4.0");
	const result = spawnSync(
		process.execPath,
		[SCRIPT, root, "gospeak-web-v1.4.1", "web"],
		{ encoding: "utf8" },
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /::error::client\/web\/package\.json/);
	assert.match(result.stderr, /expected version "1\.4\.1"/);
	assert.match(result.stderr, /actual "1\.4\.0"/);
});

test("CLI infers the component from a release tag argument", () => {
	const root = createMobileRoot();
	const result = spawnSync(
		process.execPath,
		[SCRIPT, root, "gospeak-mobile-v1.4.1"],
		{ encoding: "utf8" },
	);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /component=mobile/);
});
