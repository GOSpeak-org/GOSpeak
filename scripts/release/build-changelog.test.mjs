import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	CHANGELOG_PATH_OF,
	SECTION_ORDER,
	buildSection,
	classify,
	insertChangelog,
	pickBaseline,
} from "./build-changelog.mjs";

const SCRIPT = fileURLToPath(new URL("./build-changelog.mjs", import.meta.url));
const FIXED_DATE = "2026-11-28";

function commit(subject) {
	return { hash: "abc1234", subject, body: "" };
}

function tmp(prefix = "gospeak-bc-") {
	return mkdtempSync(join(tmpdir(), prefix));
}

function generate(args) {
	return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("classify maps conventional commit types onto the historical sections", () => {
	const map = classify([
		commit("feat(web): 新增面板"),
		commit("fix: 修复崩溃"),
		commit("perf: 首屏提速"),
		commit("docs: 补文档"),
		commit("ci: 流水线调整"),
		commit("refactor: 拆模块"),
		commit("style: 格式"),
		commit("test: 补用例"),
		commit("build: 构建脚本"),
		commit("chore: 杂项"),
		commit("revert: 回滚"),
	]);

	assert.deepEqual(SECTION_ORDER, [
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
	]);
	assert.deepEqual(map.Features, [{ scope: "web", desc: "新增面板" }]);
	assert.deepEqual(map["Bug Fixes"], [{ scope: "", desc: "修复崩溃" }]);
	assert.deepEqual(map.Performance, [{ scope: "", desc: "首屏提速" }]);
	assert.deepEqual(map.Documentation, [{ scope: "", desc: "补文档" }]);
	assert.deepEqual(map["CI/CD"], [{ scope: "", desc: "流水线调整" }]);
	assert.deepEqual(map.Refactoring, [{ scope: "", desc: "拆模块" }]);
	assert.deepEqual(map.Styles, [{ scope: "", desc: "格式" }]);
	assert.deepEqual(map.Tests, [{ scope: "", desc: "补用例" }]);
	assert.deepEqual(map.Build, [{ scope: "", desc: "构建脚本" }]);
	assert.deepEqual(map.Chores, [{ scope: "", desc: "杂项" }]);
	assert.deepEqual(map.Reverts, [{ scope: "", desc: "回滚" }]);
});

test("non-conventional and unknown types fall back to Chores", () => {
	const map = classify([commit("随便写的一条提交"), commit("wip: 半成品")]);
	assert.equal(map.Chores.length, 2);
	assert.equal(map.Chores[0].desc, "随便写的一条提交");
});

test("buildSection renders compare link, date and sections in fixed order", () => {
	const block = buildSection({
		component: "web",
		version: "1.4.1",
		baseline: "gospeak-web-v1.4.0",
		date: FIXED_DATE,
		commits: [commit("fix: 修 bug"), commit("feat(ui): 新面板")],
	});

	assert.match(
		block,
		/^## \[1\.4\.1\]\(https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/compare\/gospeak-web-v1\.4\.0\.\.\.gospeak-web-v1\.4\.1\) \(2026-11-28\)$/m,
	);
	assert.ok(block.indexOf("### Features") < block.indexOf("### Bug Fixes"));
	assert.match(block, /^\* ui: 新面板$/m);
	assert.match(block, /^\* 修 bug$/m);
});

test("buildSection without a baseline links the release tag instead of a compare", () => {
	const block = buildSection({
		component: "mobile",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [],
	});
	assert.match(block, /releases\/tag\/gospeak-mobile-v1\.4\.1/);
	assert.match(block, /无分类变更/);
});

test("insertChangelog creates the file with a header when missing", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	const block = buildSection({
		component: "server",
		version: "1.3.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 首个版本")],
	});
	insertChangelog(file, block, "1.3.1", false);

	const content = readFileSync(file, "utf8");
	assert.match(content, /^# Changelog \/ 更新日志/);
	assert.match(content, /## \[1\.3\.1\]/);
});

test("insertChangelog is idempotent for the same version", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	const block = buildSection({
		component: "web",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 新功能")],
	});
	insertChangelog(file, block, "1.4.1", false);
	const first = readFileSync(file, "utf8");
	insertChangelog(file, block, "1.4.1", false);
	const second = readFileSync(file, "utf8");

	assert.equal(second, first);
	assert.equal((second.match(/## \[1\.4\.1\]/g) || []).length, 1);
});

test("a newer version is inserted above the existing ones", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	const older = buildSection({
		component: "desktop",
		version: "1.4.0",
		baseline: "",
		date: "2026-10-01",
		commits: [commit("feat: 旧功能")],
	});
	const newer = buildSection({
		component: "desktop",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("fix: 新修复")],
	});
	insertChangelog(file, older, "1.4.0", false);
	insertChangelog(file, newer, "1.4.1", false);

	const content = readFileSync(file, "utf8");
	assert.ok(content.indexOf("## [1.4.1]") < content.indexOf("## [1.4.0]"));
});

test("--replace rewrites the same version section in place", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	const oldBlock = buildSection({
		component: "server",
		version: "1.3.1",
		baseline: "",
		date: "2026-01-01",
		commits: [commit("feat: 旧条目")],
	});
	const newBlock = buildSection({
		component: "server",
		version: "1.3.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 新条目")],
	});
	insertChangelog(file, oldBlock, "1.3.1", false);
	insertChangelog(file, newBlock, "1.3.1", true);

	const content = readFileSync(file, "utf8");
	assert.match(content, /新条目/);
	assert.doesNotMatch(content, /旧条目/);
	assert.equal((content.match(/## \[1\.3\.1\]/g) || []).length, 1);
});

test("CLI --no-write prints the section and touches no file", () => {
	const dir = tmp();
	const result = generate([
		"--component",
		"server",
		"--version",
		"9.9.9",
		"--date",
		FIXED_DATE,
		"--baseline",
		"HEAD",
		"--no-write",
		"--root",
		dir,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^## \[9\.9\.9\]/m);
	assert.match(result.stdout, /无分类变更/);
	assert.match(result.stderr, /\[build-changelog\] component=server/);
	assert.equal(existsSync(join(dir, CHANGELOG_PATH_OF.server)), false);
});

test("CLI writes into the component changelog under --root", () => {
	const dir = tmp();
	const result = generate([
		"--component",
		"web",
		"--version",
		"9.9.8",
		"--date",
		FIXED_DATE,
		"--root",
		dir,
	]);
	assert.equal(result.status, 0, result.stderr);

	const target = join(dir, CHANGELOG_PATH_OF.web);
	assert.equal(existsSync(target), true);
	const content = readFileSync(target, "utf8");
	assert.match(content, /^# Changelog \/ 更新日志/);
	assert.match(content, /## \[9\.9\.8\]/);
});

test("CLI uses the explicit baseline in the compare link", () => {
	const dir = tmp();
	const result = generate([
		"--component",
		"mobile",
		"--version",
		"1.4.1",
		"--baseline",
		"gospeak-mobile-v1.4.0",
		"--date",
		FIXED_DATE,
		"--no-write",
		"--root",
		dir,
	]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stdout,
		/compare\/gospeak-mobile-v1\.4\.0\.\.\.gospeak-mobile-v1\.4\.1/,
	);
});

test("CLI rejects missing version, unknown component and bad date", () => {
	const missingVersion = generate(["--component", "server"]);
	assert.equal(missingVersion.status, 1);
	assert.match(missingVersion.stderr, /usage:/);

	const unknownComponent = generate([
		"--component",
		"cli",
		"--version",
		"1.0.0",
	]);
	assert.equal(unknownComponent.status, 1);
	assert.match(unknownComponent.stderr, /unknown --component/);

	const badDate = generate([
		"--component",
		"server",
		"--version",
		"1.0.0",
		"--date",
		"2026/11/28",
	]);
	assert.equal(badDate.status, 1);
	assert.match(badDate.stderr, /invalid --date/);

	const unknownFlag = generate([
		"--component",
		"server",
		"--version",
		"1.0.0",
		"--nope",
	]);
	assert.equal(unknownFlag.status, 1);
	assert.match(unknownFlag.stderr, /unknown argument/);
});

test("new version is anchored directly under the H1", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	writeFileSync(
		file,
		[
			"# Changelog / 更新日志",
			"",
			"## [1.4.0](https://example.test/compare) (2026-10-01)",
			"",
			"* 旧条目",
			"",
		].join("\n"),
	);
	const block = buildSection({
		component: "web",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 新功能")],
	});
	insertChangelog(file, block, "1.4.1", false);

	const content = readFileSync(file, "utf8");
	const h1End =
		content.indexOf("# Changelog / 更新日志") + "# Changelog / 更新日志".length;
	const newer = content.indexOf("## [1.4.1]");
	const older = content.indexOf("## [1.4.0]");
	assert.ok(newer > h1End, "new section must follow the H1");
	assert.ok(older > newer, "newest version must stay on top");
	assert.equal(content.slice(h1End, newer).trim(), "");
});

test("H1 preamble stays above the newest section and survives --replace", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	writeFileSync(
		file,
		[
			"# Changelog / 更新日志",
			"",
			"> 本仓自 1.4.1 起在此累积；1.x 历史版本见末节。",
			"",
			"## [1.4.0](https://example.test/compare) (2026-10-01)",
			"",
			"* 旧条目",
			"",
			"## 历史版本",
			"",
			"- 旧仓链接",
			"",
		].join("\n"),
	);
	const block = buildSection({
		component: "web",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 新功能")],
	});
	insertChangelog(file, block, "1.4.1", false);
	insertChangelog(file, block, "1.4.1", true);

	const content = readFileSync(file, "utf8");
	assert.match(content, /> 本仓自 1\.4\.1 起在此累积/);
	const preamble = content.indexOf("> 本仓自");
	const newer = content.indexOf("## [1.4.1]");
	const older = content.indexOf("## [1.4.0]");
	const history = content.indexOf("## 历史版本");
	assert.ok(preamble < newer, "preamble must stay above the newest section");
	assert.ok(newer < older, "newest version stays on top");
	assert.ok(history > older, "history stays at the bottom");
	assert.equal((content.match(/## \[1\.4\.1\]/g) || []).length, 1);
	const firstHeading = content
		.split("\n")
		.find((line) => line.startsWith("## "));
	assert.equal(
		firstHeading,
		"## [1.4.1](https://github.com/GOSpeak-org/GOSpeak/releases/tag/gospeak-web-v1.4.1) (2026-11-28)",
	);
});

test("the trailing history section is never moved above a version", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	writeFileSync(
		file,
		[
			"# Changelog / 更新日志",
			"",
			"## [1.4.0](https://example.test/compare) (2026-10-01)",
			"",
			"* 旧条目",
			"",
			"## 历史版本",
			"",
			"- 旧仓：https://github.com/GOSpeak-org/GOSpeak-Client/releases",
			"",
		].join("\n"),
	);
	const block = buildSection({
		component: "desktop",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 新功能")],
	});
	insertChangelog(file, block, "1.4.1", false);

	const content = readFileSync(file, "utf8");
	const history = content.indexOf("## 历史版本");
	assert.ok(
		history > content.indexOf("## [1.4.1]"),
		"history must follow the newest version",
	);
	assert.ok(
		history > content.indexOf("## [1.4.0]"),
		"history must follow older versions",
	);
	const sections = content.split("\n").filter((line) => line.startsWith("## "));
	assert.deepEqual(sections, [
		"## [1.4.1](https://github.com/GOSpeak-org/GOSpeak/releases/tag/gospeak-desktop-v1.4.1) (2026-11-28)",
		"## [1.4.0](https://example.test/compare) (2026-10-01)",
		"## 历史版本",
	]);
});

test("--replace keeps the history section at the bottom and leaves one version section", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	writeFileSync(
		file,
		[
			"# Changelog / 更新日志",
			"",
			"## [1.4.1](https://example.test/old) (2026-10-01)",
			"",
			"* 旧的 1.4.1 条目",
			"",
			"## [1.4.0](https://example.test/compare) (2026-09-01)",
			"",
			"* 旧条目",
			"",
			"## 历史版本",
			"",
			"- 旧仓链接",
			"",
		].join("\n"),
	);
	const block = buildSection({
		component: "mobile",
		version: "1.4.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("fix: 新修复")],
	});
	insertChangelog(file, block, "1.4.1", true);

	const content = readFileSync(file, "utf8");
	assert.equal((content.match(/## \[1\.4\.1\]/g) || []).length, 1);
	assert.match(content, /新修复/);
	assert.doesNotMatch(content, /旧的 1\.4\.1 条目/);
	const history = content.indexOf("## 历史版本");
	assert.ok(history > content.indexOf("## [1.4.1]"));
	assert.ok(history > content.indexOf("## [1.4.0]"));
	assert.ok(content.trimEnd().endsWith("- 旧仓链接"));
});

test("repeated insert of the same version never duplicates a section", () => {
	const dir = tmp();
	const file = join(dir, "CHANGELOG.md");
	writeFileSync(file, "# Changelog / 更新日志\n\n## 历史版本\n\n- 旧仓链接\n");
	const block = buildSection({
		component: "server",
		version: "1.3.1",
		baseline: "",
		date: FIXED_DATE,
		commits: [commit("feat: 新功能")],
	});
	insertChangelog(file, block, "1.3.1", false);
	const first = readFileSync(file, "utf8");
	insertChangelog(file, block, "1.3.1", false);
	const second = readFileSync(file, "utf8");

	assert.equal(second, first);
	assert.equal((second.match(/## \[1\.3\.1\]/g) || []).length, 1);
	assert.ok(second.indexOf("## [1.3.1]") < second.indexOf("## 历史版本"));
});

test("pickBaseline skips the tag being released and other components", () => {
	const tags = [
		"gospeak-web-v1.4.1",
		"gospeak-server-v1.3.1",
		"gospeak-web-v1.4.0",
		"gospeak-desktop-v1.4.0",
		"0.4.0",
	];
	assert.equal(pickBaseline(tags, "web", "1.4.1"), "gospeak-web-v1.4.0");
	assert.equal(pickBaseline(tags, "web", "1.4.2"), "gospeak-web-v1.4.1");
	assert.equal(pickBaseline(tags, "server", "1.3.1"), "");
	assert.equal(pickBaseline([], "mobile", "1.0.0"), "");
});
