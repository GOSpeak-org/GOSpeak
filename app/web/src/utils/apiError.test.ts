import { describe, expect, it } from "vitest";
import { unreachableMessage } from "./apiError";

describe("unreachableMessage", () => {
	it("recognises the proxy 6002 envelope", () => {
		const err = {
			response: { data: { code: 6002, msg: "backend unreachable" } },
		};
		expect(unreachableMessage(err)).toBe("无法连接到服务器，请检查地址或网络");
	});

	it("ignores other errors", () => {
		expect(
			unreachableMessage({ response: { data: { code: 5001 } } }),
		).toBeNull();
		expect(unreachableMessage(new Error("boom"))).toBeNull();
	});
});
