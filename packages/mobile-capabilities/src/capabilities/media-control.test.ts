import { describe, expect, it, vi } from "vitest";
import { createMediaControl, isMediaAction } from "./media-control";

describe("isMediaAction", () => {
	it("accepts known actions", () => {
		expect(isMediaAction("mute")).toBe(true);
		expect(isMediaAction("hangup")).toBe(true);
	});

	it("rejects unknown actions", () => {
		expect(isMediaAction("skip")).toBe(false);
		expect(isMediaAction(null)).toBe(false);
	});
});

describe("createMediaControl in web fallback", () => {
	it("resolves setMetadata without native runtime", async () => {
		await expect(
			createMediaControl().setMetadata({ title: "房间", subtitle: "3 人" }),
		).resolves.toBeUndefined();
	});

	it("resolves clear", async () => {
		await expect(createMediaControl().clear()).resolves.toBeUndefined();
	});

	it("returns an unsubscribe function", () => {
		const off = createMediaControl().onAction(() => {});
		expect(typeof off).toBe("function");
		expect(() => off()).not.toThrow();
	});

	it("does not invoke handlers in fallback", () => {
		const handler = vi.fn();
		createMediaControl().onAction(handler);
		expect(handler).not.toHaveBeenCalled();
	});
});
