import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	aggregateTag,
	renderAggregate,
	renderTable,
} from "./render-aggregate.mjs";

const SCRIPT = fileURLToPath(
	new URL("./render-aggregate.mjs", import.meta.url),
);
const REPO = "GOSpeak-org/GOSpeak";
const DATE = "2026-11-28";

const DESKTOP = {
	tagName: "gospeak-desktop-v1.4.1",
	assets: [
		{ name: "gospeak-desktop-v1.4.1-darwin-arm64.dmg" },
		{ name: "gospeak-desktop-v1.4.1-linux-amd64.deb" },
		{ name: "SHA256SUMS-gospeak-desktop-v1.4.1.txt" },
	],
};

const MOBILE = {
	tagName: "gospeak-mobile-v1.4.1",
	assets: [
		{ name: "gospeak-mobile-v1.4.1-android.apk" },
		{ name: "SHA256SUMS-gospeak-mobile-v1.4.1.txt" },
	],
};

const SERVER = {
	tagName: "gospeak-server-v1.3.1",
	assets: [
		{ name: "gospeak-server-v1.3.1-linux-amd64" },
		{ name: "gospeak-server-v1.3.1-windows-amd64.exe" },
		{ name: "SHA256SUMS-gospeak-server-v1.3.1.txt" },
	],
};

function write(root, rel, content) {
	const target = join(root, rel);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

function tmp(prefix = "gospeak-agg-") {
	return mkdtempSync(join(tmpdir(), prefix));
}

function createRoot({
	desktop = DESKTOP,
	mobile = MOBILE,
	server = SERVER,
} = {}) {
	const root = tmp();
	write(root, ".github/versions/desktop.yaml", 'version: "1.4.1"\n');
	write(root, ".github/versions/mobile.yaml", 'version: "1.4.1"\n');
	write(root, ".github/versions/server.yaml", 'version: "1.3.1"\n');
	if (desktop) {
		write(
			root,
			".github/release-fixtures/desktop.json",
			JSON.stringify(desktop),
		);
	}
	if (mobile) {
		write(root, ".github/release-fixtures/mobile.json", JSON.stringify(mobile));
	}
	if (server) {
		write(root, ".github/release-fixtures/server.json", JSON.stringify(server));
	}
	return root;
}

function generate(args, cwd) {
	return spawnSync(process.execPath, [SCRIPT, ...args], {
		cwd,
		encoding: "utf8",
	});
}

test("aggregate tag is GOSpeak-<YYMMDD> derived from the date", () => {
	assert.equal(aggregateTag("2026-11-28"), "GOSpeak-261128");
	assert.equal(aggregateTag("2026-01-05"), "GOSpeak-260105");
	assert.equal(aggregateTag("2027-12-31"), "GOSpeak-271231");
	assert.throws(() => aggregateTag("2026/11/28"), /invalid --date/);
	assert.throws(() => aggregateTag(""), /invalid --date/);
});

test("a release without assets degrades to a 未发布 row", () => {
	const table = renderTable(
		"desktop",
		{
			tagName: "gospeak-desktop-v1.4.1",
			assets: [],
			missing: true,
			version: "1.4.1",
		},
		REPO,
		"1.4.1",
	);
	assert.match(table, /未发布/);
	assert.match(table, /\| 平台 \| 架构 \| 下载 \| 文件 \|/);
});

test("table rows use the real tag and direct download URLs", () => {
	const table = renderTable(
		"desktop",
		{
			tagName: "gospeak-desktop-v1.4.1",
			assets: DESKTOP.assets.map((asset) => asset.name),
			version: "1.4.1",
		},
		REPO,
		"1.4.1",
	);
	assert.match(
		table,
		/https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\/download\/gospeak-desktop-v1\.4\.1\/gospeak-desktop-v1\.4\.1-darwin-arm64\.dmg/,
	);
	assert.match(table, /macOS/);
	assert.match(table, /Intel|x64/);
	const rows = table.split("\n");
	const dmg = rows.findIndex((row) => row.includes("darwin-arm64.dmg"));
	const deb = rows.findIndex((row) => row.includes("linux-amd64.deb"));
	assert.ok(dmg > 0 && deb > dmg, "target order must be stable");
	const sums = rows.findIndex((row) => row.includes("SHA256SUMS"));
	assert.equal(sums, rows.length - 1, "checksum row must be last");
});

test("renderAggregate emits the title, three tables and legacy entry points", () => {
	const releases = {
		desktop: {
			...DESKTOP,
			version: "1.4.1",
			missing: false,
			assets: DESKTOP.assets.map((a) => a.name),
		},
		mobile: {
			...MOBILE,
			version: "1.4.1",
			missing: false,
			assets: MOBILE.assets.map((a) => a.name),
		},
		server: {
			...SERVER,
			version: "1.3.1",
			missing: false,
			assets: SERVER.assets.map((a) => a.name),
		},
	};
	const page = renderAggregate({ repo: REPO, date: DATE, releases });

	assert.match(page, /^# GOSpeak-261128$/m);
	assert.match(page, /## 桌面端 · /);
	assert.match(page, /## 移动端 · /);
	assert.match(page, /## 服务端 · /);
	assert.doesNotMatch(page, /## Web/);
	assert.match(
		page,
		/https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\/download\/gospeak-mobile-v1\.4\.1\/gospeak-mobile-v1\.4\.1-android\.apk/,
	);
	assert.match(
		page,
		/https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\/download\/gospeak-server-v1\.3\.1\/gospeak-server-v1\.3\.1-linux-amd64/,
	);
	assert.match(
		page,
		/\[GOSpeak-Server\]\(https:\/\/github\.com\/GOSpeak-org\/GOSpeak-Server\/releases\)/,
	);
	assert.match(
		page,
		/\[GOSpeak-Client\]\(https:\/\/github\.com\/GOSpeak-org\/GOSpeak-Client\/releases\)/,
	);
	assert.ok(page.indexOf("## 桌面端") < page.indexOf("## 移动端"));
	assert.ok(page.indexOf("## 移动端") < page.indexOf("## 服务端"));
});

test("CLI renders from local fixtures with --no-gh", () => {
	const root = createRoot();
	const result = generate(
		[
			"--repo",
			REPO,
			"--date",
			DATE,
			"--no-gh",
			"--root",
			root,
			"--fixtures",
			join(root, ".github", "release-fixtures"),
		],
		root,
	);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^# GOSpeak-261128$/m);
	assert.match(
		result.stdout,
		/releases\/download\/gospeak-desktop-v1\.4\.1\/gospeak-desktop-v1\.4\.1-darwin-arm64\.dmg/,
	);
	assert.match(
		result.stdout,
		/releases\/download\/gospeak-server-v1\.3\.1\/SHA256SUMS-gospeak-server-v1\.3\.1\.txt/,
	);
	assert.match(result.stdout, /GOSpeak-Client/);
});

test("CLI --fixtures defaults to <root>/.github/release-fixtures", () => {
	const root = createRoot();
	const result = generate(
		["--repo", REPO, "--date", DATE, "--no-gh", "--root", root],
		root,
	);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /gospeak-mobile-v1\.4\.1-android\.apk/);
});

test("CLI --out writes the same markdown to a file", () => {
	const root = createRoot();
	const out = join(root, "dist", "aggregate.md");
	const result = generate(
		["--repo", REPO, "--date", DATE, "--no-gh", "--root", root, "--out", out],
		root,
	);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(out), true);
	assert.equal(readFileSync(out, "utf8"), result.stdout);
	assert.match(result.stderr, /wrote/);
});

test("CLI degrades a missing fixture to 未发布 without failing", () => {
	const root = createRoot({ mobile: null });
	const result = generate(
		["--repo", REPO, "--date", DATE, "--no-gh", "--root", root],
		root,
	);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /## 移动端/);
	assert.match(result.stdout, /未发布/);
});

test("CLI validates repo, date and fixture JSON", () => {
	const root = createRoot();
	const missingRepo = generate(["--date", DATE, "--no-gh"], root);
	assert.equal(missingRepo.status, 1);
	assert.match(missingRepo.stderr, /--repo is required/);

	const badRepo = generate(
		["--repo", "gospeak", "--date", DATE, "--no-gh", "--root", root],
		root,
	);
	assert.equal(badRepo.status, 1);
	assert.match(badRepo.stderr, /invalid --repo/);

	const missingDate = generate(
		["--repo", REPO, "--no-gh", "--root", root],
		root,
	);
	assert.equal(missingDate.status, 1);
	assert.match(missingDate.stderr, /--date is required/);

	const badDate = generate(
		["--repo", REPO, "--date", "2026-11", "--no-gh", "--root", root],
		root,
	);
	assert.equal(badDate.status, 1);
	assert.match(badDate.stderr, /invalid --date/);

	write(root, ".github/release-fixtures/server.json", "{ not json");
	const badFixture = generate(
		["--repo", REPO, "--date", DATE, "--no-gh", "--root", root],
		root,
	);
	assert.equal(badFixture.status, 1);
	assert.match(badFixture.stderr, /invalid fixture JSON/);
});

function releasesFromFixtures() {
	return {
		desktop: {
			tagName: DESKTOP.tagName,
			assets: DESKTOP.assets.map((asset) => asset.name),
			missing: false,
			version: "1.4.1",
		},
		mobile: {
			tagName: MOBILE.tagName,
			assets: MOBILE.assets.map((asset) => asset.name),
			missing: false,
			version: "1.4.1",
		},
		server: {
			tagName: SERVER.tagName,
			assets: SERVER.assets.map((asset) => asset.name),
			missing: false,
			version: "1.3.1",
		},
	};
}

test("published table titles link to the release tag and the component list", () => {
	const page = renderAggregate({
		repo: REPO,
		date: DATE,
		releases: releasesFromFixtures(),
	});

	assert.match(
		page,
		/## 桌面端 · \[.*\]\(https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\/tag\/gospeak-desktop-v1\.4\.1\)/,
	);
	assert.match(
		page,
		/## 移动端 · \[.*\]\(https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\/tag\/gospeak-mobile-v1\.4\.1\)/,
	);
	assert.match(
		page,
		/## 服务端 · \[.*\]\(https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\/tag\/gospeak-server-v1\.3\.1\)/,
	);
	assert.match(
		page,
		/https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\?q=gospeak-desktop-v/,
	);
	assert.match(
		page,
		/https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\?q=gospeak-mobile-v/,
	);
	assert.match(
		page,
		/https:\/\/github\.com\/GOSpeak-org\/GOSpeak\/releases\?q=gospeak-server-v/,
	);
	assert.match(page, /查看该端全部 Release/);
});

test("unpublished components keep a plain title and produce no dead links", () => {
	const releases = releasesFromFixtures();
	releases.desktop = {
		tagName: DESKTOP.tagName,
		assets: [],
		missing: true,
		version: "1.4.1",
	};
	const page = renderAggregate({ repo: REPO, date: DATE, releases });
	const start = page.indexOf("## 桌面端");
	const end = page.indexOf("## 移动端");
	const desktop = page.slice(start, end);

	assert.match(desktop, /gospeak-desktop-v1\.4\.1/);
	assert.match(desktop, /未发布/);
	assert.doesNotMatch(desktop, /releases\/tag\//);
	assert.doesNotMatch(desktop, /releases\?q=/);
});
