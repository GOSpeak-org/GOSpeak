import { describe, expect, it, vi } from "vitest";

const mockInstance = vi.hoisted(() => {
	const instance = {
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
		request: vi.fn(),
	};
	return { instance };
});

vi.mock("axios", () => ({
	default: {
		create: vi.fn(() => mockInstance.instance),
	},
}));

import { APIClient } from "./apiClient";

const response = (
	data: { code: number; msg: string; data?: unknown },
	config: Record<string, unknown> = {},
) => ({
	data,
	status: 200,
	statusText: "OK",
	headers: {},
	config,
});

describe("APIClient", () => {
	it("resolves Result.data instead of AxiosResponse", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 0, msg: "success", data: { ok: true } }),
		);

		const value = await client.get<{ ok: boolean }>({ url: "/x" });
		expect(value.ok).toBe(true);
	});

	it("rejects with an Error carrying the backend msg when code !== 0", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 3001, msg: "房间不存在", data: null }),
		);

		const error = await client.get({ url: "/room" }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("房间不存在");
	});

	it("propagates the interceptor __toastShown mark from the request config", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 3001, msg: "房间不存在" }, { __toastShown: true }),
		);

		const error = (await client
			.post({ url: "/room" })
			.catch((e: unknown) => e)) as
			| (Error & { __toastShown?: boolean })
			| undefined;
		expect(error?.__toastShown).toBe(true);
	});

	it("defaults __toastShown to false when the config is unmarked", async () => {
		const client = new APIClient("/");
		mockInstance.instance.request.mockResolvedValue(
			response({ code: 3001, msg: "房间不存在" }),
		);

		const error = (await client
			.post({ url: "/room" })
			.catch((e: unknown) => e)) as
			| (Error & { __toastShown?: boolean })
			| undefined;
		expect(error?.__toastShown).toBe(false);
	});
});
