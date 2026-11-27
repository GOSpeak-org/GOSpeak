import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");
const destination = resolve(packageRoot, "proto/plugin.proto");

// proto 单一事实源是仓内 server/server（monorepo 后不再跨仓）。
// 优先用 GOSPEAK_SERVER_PROTO 显式指定的检出，其次仓内路径，最后兼容分离部署的
// 同级 server 仓；都不在时退回本仓已版本化的快照，保证 test/build 可用。
const candidates = [
	process.env.GOSPEAK_SERVER_PROTO,
	resolve(repoRoot, "server/server/plugin/proto/plugin.proto"),
	resolve(repoRoot, "../server/server/plugin/proto/plugin.proto"),
].filter((candidate) => typeof candidate === "string" && candidate.length > 0);

const source = candidates.find((candidate) => existsSync(candidate));

mkdirSync(dirname(destination), { recursive: true });
if (source) {
	copyFileSync(source, destination);
	console.log(`copied plugin.proto from ${source} (single source of truth)`);
} else if (existsSync(destination)) {
	console.log(
		"server proto checkout not found; using checked-in proto/plugin.proto snapshot",
	);
} else {
	console.error(
		"plugin.proto missing: no server checkout found and no checked-in snapshot",
	);
	process.exit(1);
}
