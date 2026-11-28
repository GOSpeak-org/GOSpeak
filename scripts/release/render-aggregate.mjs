#!/usr/bin/env node
// 根仓聚合发布（GOSpeak-YYMMDD）正文渲染：
// 不构建任何产物，只从子仓的 Release 里取资产，用表格汇总直链。
//
// 用法：node scripts/release/render-aggregate.mjs --date 20261128 > notes.md
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
function arg(name, fallback) {
	const i = args.indexOf("--" + name);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const date = arg(
	"date",
	new Date().toISOString().slice(0, 10).replaceAll("-", ""),
);
const serverRepo = arg("server-repo", "GOSpeak-org/GOSpeak-Server");
const clientRepo = arg("client-repo", "GOSpeak-org/GOSpeak-Client");

function ghApi(path) {
	return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
}

function latestRelease(repo, prefix) {
	const releases = ghApi("repos/" + repo + "/releases?per_page=50");
	return releases.find((r) => r.tag_name.startsWith(prefix)) ?? null;
}

function mb(bytes) {
	return (Number(bytes) / 1024 / 1024).toFixed(1) + " MB";
}

function assetTable(release, repo) {
	if (!release) return "_本次未发布_\n";
	const rows = release.assets.map((a) => {
		const url =
			"https://github.com/" +
			repo +
			"/releases/download/" +
			release.tag_name +
			"/" +
			a.name;
		return "| " + a.name + " | " + mb(a.size) + " | [下载](" + url + ") |";
	});
	return ["| 产物 | 大小 | 链接 |", "|---|---|---|", ...rows].join("\n");
}

function section(repo, prefix, extra = "") {
	const release = latestRelease(repo, prefix);
	const head = release
		? "**" +
			release.tag_name +
			"** · [该端全部 Release](https://github.com/" +
			repo +
			"/releases)"
		: "**未发布** · [该端全部 Release](https://github.com/" +
			repo +
			"/releases)";
	return [head, "", assetTable(release, repo), extra]
		.filter(Boolean)
		.join("\n");
}

const lines = [
	"# GOSpeak " +
		date.slice(0, 4) +
		"-" +
		date.slice(4, 6) +
		"-" +
		date.slice(6) +
		" 聚合发布",
	"",
	"> 本 Release 只是**聚合页**：产物与校验和在各子仓的 Release 里，下表直链到对应资产。",
	"",
	"## 服务端",
	"",
	section(serverRepo, "gospeak-server-v"),
	"",
	"## 桌面端",
	"",
	section(clientRepo, "gospeak-desktop-v"),
	"",
	"## 移动端",
	"",
	section(
		clientRepo,
		"gospeak-mobile-v",
		"\n> 只提供 Android APK（debug 签名，仅供内测）。",
	),
	"",
	"## Web",
	"",
	section(clientRepo, "gospeak-web-v"),
	"",
	"---",
	"",
	"- 服务端仓：https://github.com/" + serverRepo,
	"- 客户端仓：https://github.com/" + clientRepo,
	"- 文档站仓：https://github.com/GOSpeak-org/GOSpeak-Docs",
];

process.stdout.write(lines.join("\n") + "\n");
