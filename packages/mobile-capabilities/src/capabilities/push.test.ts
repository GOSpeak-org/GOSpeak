import { describe, expect, it } from "vitest";
import { createPush, normalizePushData } from "./push";

describe("normalizePushData", () => {
	it("keeps string values", () => {
		expect(normalizePushData({ path: "/invite/d/abc" })).toEqual({
			path: "/invite/d/abc",
		});
	});

	it("returns an empty object for non-objects", () => {
		expect(normalizePushData(null)).toEqual({});
		expect(normalizePushData("x")).toEqual({});
	});
});

describe("createPush in web fallback", () => {
	it("resolves register to null without a native runtime", async () => {
		await expect(createPush().register()).resolves.toBeNull();
	});

	it("returns unsubscribe functions", () => {
		const push = createPush();
		expect(typeof push.onToken(() => {})).toBe("function");
		expect(typeof push.onNotificationOpened(() => {})).toBe("function");
	});

	it("does not throw when unsubscribing twice", () => {
		const push = createPush();
		const off = push.onToken(() => {});
		off();
		expect(() => off()).not.toThrow();
	});
});
