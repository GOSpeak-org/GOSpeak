import {
	execFileSync,
	spawn,
	type ChildProcessWithoutNullStreams,
} from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const setupDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(setupDir, "..");
const serverDir = join(repoRoot, "app/server");
const runtimeDir = join(setupDir, ".runtime");
const serverInfoPath = join(runtimeDir, "server.json");

interface ServerState {
	child: ChildProcessWithoutNullStreams;
	dir: string;
	port: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function newestSourceMtime(dir: string, ignored = new Set<string>()): number {
	let latest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (ignored.has(entry.name)) {
			continue;
		}
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			latest = Math.max(latest, newestSourceMtime(full, ignored));
		} else if (
			entry.name.endsWith(".go") ||
			entry.name === "go.mod" ||
			entry.name === "go.sum"
		) {
			latest = Math.max(latest, statSync(full).mtimeMs);
		}
	}
	return latest;
}

function getFreePort(): Promise<number> {
	return new Promise((resolvePromise, rejectPromise) => {
		const server = net.createServer();
		server.once("error", rejectPromise);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const port = address.port;
				server.close(() => resolvePromise(port));
			} else {
				server.close(() =>
					rejectPromise(new Error("failed to allocate free port")),
				);
			}
		});
	});
}

async function waitForServer(state: ServerState): Promise<void> {
	const url = `http://127.0.0.1:${state.port}`;
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (state.child.exitCode !== null) {
			throw new Error(
				`integration server exited early: ${state.child.exitCode}`,
			);
		}
		try {
			const response = await fetch(`${url}/readyz`);
			if (response.ok) {
				const body = (await response.json()) as { status?: string };
				if (body.status === "ok") {
					writeFileSync(serverInfoPath, JSON.stringify({ url }, null, 2));
					return;
				}
			}
		} catch {
			// server is still starting
		}
		await sleep(500);
	}
	throw new Error(
		`integration server did not become ready within 90s; log: ${state.dir}/server.log`,
	);
}

async function stopServer(
	child: ChildProcessWithoutNullStreams,
): Promise<void> {
	if (child.exitCode === null) {
		child.kill("SIGTERM");
		await Promise.race([
			new Promise<void>((resolvePromise) =>
				child.once("exit", () => resolvePromise()),
			),
			sleep(8_000),
		]);
	}
	if (child.exitCode === null) {
		child.kill("SIGKILL");
		await Promise.race([
			new Promise<void>((resolvePromise) =>
				child.once("exit", () => resolvePromise()),
			),
			sleep(2_000),
		]);
	}
}

/** 启动失败要把日志尾巴打出来：目录随后会被删掉，报错信息里的路径不再可读。 */
function logTail(logFile: string, maxLines = 40): string {
	if (!existsSync(logFile)) {
		return "(no server log)";
	}
	const lines = readFileSync(logFile, "utf8").trimEnd().split("\n");
	return lines.slice(-maxLines).join("\n");
}

export default async function setup(): Promise<() => Promise<void>> {
	mkdirSync(runtimeDir, { recursive: true });

	const externalUrl = process.env.GOSPEAK_TEST_URL;
	if (externalUrl) {
		writeFileSync(
			serverInfoPath,
			JSON.stringify({ url: externalUrl.replace(/\/$/, "") }, null, 2),
		);
		return async () => rmSync(runtimeDir, { recursive: true, force: true });
	}

	const bin =
		process.env.GOSPEAK_SERVER_BIN ||
		join(runtimeDir, `gospeak-${process.platform}-${process.arch}`);
	const binaryMtime = existsSync(bin) ? statSync(bin).mtimeMs : 0;
	const sourceMtime = newestSourceMtime(
		serverDir,
		new Set(["tmp", "vendor", "docs", "internal/webui/dist"]),
	);
	if (binaryMtime === 0 || sourceMtime > binaryMtime) {
		console.log("[integration] building isolated test server...");
		execFileSync(
			"go",
			["build", "-tags", "noembedweb", "-o", bin, "./main.go"],
			{
				cwd: serverDir,
				stdio: "inherit",
			},
		);
	}

	const port = await getFreePort();
	const dir = mkdtempSync(join(runtimeDir, "server-"));
	const logFile = join(dir, "server.log");
	const child = spawn(bin, ["server", "-e", "test"], {
		cwd: serverDir,
		// 只透出运行 Go 二进制所需的最小环境：避免开发者的 GOSPEAK_ENV_FILE /
		// 生产密钥类变量进入被测进程，保证集成测试可复现、与本地 shell 无关。
		env: {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? "",
			TMPDIR: process.env.TMPDIR ?? "",
			APP_ENV: "test",
			GOSPEAK_ROLE: "all",
			SERVER_PORT: String(port),
			DB_TYPE: "SQLite",
			DB_PATH: join(dir, "app.db"),
			// 并行 vitest worker 会并发写 SQLite（私聊未读计数、消息落库等）；
			// WAL + busy_timeout 消除 SQLITE_BUSY 下的静默写失败（见 repository/db.go）。
			DB_WAL: "true",
			// auto = embedded NATS (default when NATS_URL empty); none 降级路径已在 v5138 移除
			STATE_STORE: "auto",
			NATS_EMBEDDED_PORT: "0",
			NATS_CONNECT_TIMEOUT: "1s",
			// 集成测试只校验配置/进房 token 接口，不拉起真实 LiveKit；
			// 使用明显的非凭据占位值，避免与任何部署密钥产生关联。
			// 部署侧密钥一律由 deploy/.env 注入，见 deploy/livekit/livekit.yaml。
			SFU_PROVIDER: "livekit",
			// 明显不可达的假地址（.invalid 是 RFC 6761 保留域）：本套件不会真的拨号
			// LiveKit，签名与进房 token 在本地生成；仅避免误连到本机 7880 上的真实服务。
			LIVEKIT_HOST: "ws://livekit.invalid:7880",
			LIVEKIT_KEY: "integration-test-key",
			LIVEKIT_SECRET: "integration-test-secret",
			GIN_MODE: "release",
			LOG_LEVEL: "warn",
			STORAGE_TYPE: "local",
			// 本地存储落盘目录与静态服务同源；测试指向临时目录，避免污染仓库 ./uploads
			STORAGE_LOCAL_DIR: join(dir, "uploads"),
			EMAIL_ENABLED: "false",
			JWT_KEY: "integration-test-jwt-key",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	child.stdout.on("data", (chunk: Buffer) => appendFileSync(logFile, chunk));
	child.stderr.on("data", (chunk: Buffer) => appendFileSync(logFile, chunk));

	const state: ServerState = { child, dir, port };
	try {
		await waitForServer(state);
	} catch (error) {
		// 启动失败不能留下孤儿进程/临时目录：先杀子进程，打印日志尾巴，再清理后重抛。
		await stopServer(child);
		console.error(
			`[integration] server startup failed; last log lines from ${logFile}:\n${logTail(logFile)}`,
		);
		rmSync(dir, { recursive: true, force: true });
		rmSync(serverInfoPath, { force: true });
		throw error;
	}
	console.log(`[integration] server ready at http://127.0.0.1:${port}`);

	return async () => {
		await stopServer(child);
		rmSync(dir, { recursive: true, force: true });
		rmSync(serverInfoPath, { force: true });
	};
}
