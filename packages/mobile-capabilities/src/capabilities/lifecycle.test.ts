import { describe, expect, it, vi } from "vitest";
import { createLifecycle, isAppState } from "./lifecycle";

describe("isAppState", () => {
	it("accepts active and background", () => {
		expect(isAppState("active")).toBe(true);
		expect(isAppState("background")).toBe(true);
	});

	it("rejects unknown states", () => {
		expect(isAppState("suspended")).toBe(false);
		expect(isAppState(1)).toBe(false);
	});
});

describe("createLifecycle in web fallback", () => {
	it("returns an unsubscribe function", () => {
		const off = createLifecycle().onStateChange(() => {});
		expect(typeof off).toBe("function");
	});

	it("does not invoke handlers in fallback", () => {
		const handler = vi.fn();
		createLifecycle().onStateChange(handler);
		expect(handler).not.toHaveBeenCalled();
	});

	it("allows double unsubscribe", () => {
		const off = createLifecycle().onStateChange(() => {});
		off();
		expect(() => off()).not.toThrow();
	});
});
