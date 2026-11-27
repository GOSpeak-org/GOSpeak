#!/usr/bin/env node
// 校验服务端 proxyrules 副本与客户端源实现一致 —— 漂移门禁。
//
// 背景：proxyrules 是纯 Go 的反代 / SSRF 校验规则，源实现位于 client/proxyrules/
// （桌面与移动端 gomobile 绑定共用）。Go 不能用相对 replace 引用别的模块，因此在
// server/server/internal/plugin/proxyrules/ 保留了一份原样副本。副本没有门禁就会
// 静默漂移，所以本脚本把「两处必须逐字节一致」变成 CI 必过项。
//
// monorepo 合并后两端都在同一个仓库里，默认直接读本地源实现，不再走网络；
// 需要拿别处（旧仓 / 指定 ref）的副本做参照时，显式传 --repo/--ref 即可回退到远端拉取。
//
// 用法：
//   node server/scripts/check-proxyrules-sync.mjs          按 sha256 比对（不一致退出 1）
//   node server/scripts/check-proxyrules-sync.mjs --fix    用源实现覆盖服务端副本
//
// 环境变量 / 参数：
//   --repo <owner/repo>  指定后改为从该仓拉取参照（默认读本仓 client/proxyrules）
//   --ref <ref>          远端 ref，默认 release
//   PROXYRULES_LOCAL_DIR 覆盖本地副本目录（默认 server/server/internal/plugin/proxyrules）
//   PROXYRULES_SOURCE_DIR 覆盖源实现目录（默认 client/proxyrules）
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 仅在显式指定 --repo 时才走远端；保留旧常量避免外部脚本 import 失效。 */
export const DEFAULT_REPO = "GOSpeak-org/GOSpeak";
export const DEFAULT_REF = "release";

export const FILES = ["proxyrules.go", "proxyrules_test.go"];

export function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

/** 仓库根：脚本在 server/scripts/ 下，向上两层。 */
export function resolveRoot() {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..", "..");
}

async function fetchRemoteFile(repo, ref, name) {
	const url = "https://raw.githubusercontent.com/" + repo + "/" + ref + "/proxyrules/" + name;
	// raw.githubusercontent 偶发瞬断，重试三次再判失败，避免门禁假红。
	let lastError;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			const res = await fetch(url);
			if (!res.ok) {
				throw new Error("拉取 " + url + " 失败：HTTP " + res.status);
			}
			return Buffer.from(await res.arrayBuffer());
		} catch (err) {
			lastError = err;
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
			}
		}
	}
	throw lastError;
}

/** 默认参照：直接读本仓的源实现。 */
function readLocalSource(sourceDir, name) {
	return readFile(join(sourceDir, name));
}

export async function run(options = {}) {
	const repo = options.repo || process.env.PROXYRULES_REPO || "";
	const ref = options.ref || process.env.PROXYRULES_REF || DEFAULT_REF;
	const localDir =
		options.localDir ||
		process.env.PROXYRULES_LOCAL_DIR ||
		join(resolveRoot(), "server/server/internal/plugin/proxyrules");
	const sourceDir =
		options.sourceDir ||
		process.env.PROXYRULES_SOURCE_DIR ||
		join(resolveRoot(), "client/proxyrules");
	const fix = Boolean(options.fix);
	// options.fetchFile 保留旧名（已有单测按此注入），未注入时按 repo 决定来源。
	const readSourceFile =
		options.fetchFile ||
		options.readSourceFile ||
		(repo ? (name) => fetchRemoteFile(repo, ref, name) : (name) => readLocalSource(sourceDir, name));
	const mismatches = [];
	for (const name of FILES) {
		const localPath = join(localDir, name);
		const local = await readFile(localPath);
		const source = await readSourceFile(name);
		const localHash = sha256(local);
		const sourceHash = sha256(source);
		if (localHash === sourceHash) continue;
		if (!fix) {
			mismatches.push({ name, localPath, localHash, sourceHash, remoteHash: sourceHash });
			continue;
		}
		await writeFile(localPath, source);
		console.log("[fix] " + name + " 已用源实现覆盖");
	}
	return { repo, ref, sourceDir, localDir, mismatches };
}

function argValue(flag) {
	const argv = process.argv;
	const index = argv.indexOf(flag);
	return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
	const fix = process.argv.includes("--fix");
	const repo = argValue("--repo");
	const ref = argValue("--ref");
	const where = repo ? repo + "@" + (ref || DEFAULT_REF) : "client/proxyrules（本仓源实现）";
	let result;
	try {
		result = await run({ fix, repo, ref });
	} catch (err) {
		console.error("[error] proxyrules 比对失败：" + err.message);
		process.exit(2);
	}
	if (result.mismatches.length === 0) {
		console.log("[ok] proxyrules 副本与 " + where + " 一致。");
		return;
	}
	console.error("[fail] proxyrules 副本与 " + where + " 不一致：");
	for (const item of result.mismatches) {
		console.error("  - " + item.name);
		console.error("      副本 sha256 " + item.localHash);
		console.error("      源   sha256 " + item.sourceHash);
	}
	console.error("修复：先改 client/proxyrules 的源实现，再跑 node server/scripts/check-proxyrules-sync.mjs --fix。");
	process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	await main();
}
