import { describe, expect, it } from "vitest";
import { BUILD_TARGET, MOBILE_BUILD, inMobile } from "./conditional";

describe("build target constants", () => {
	it("defaults to a known target outside a bundler", () => {
		expect(["web", "desktop", "mobile"]).toContain(BUILD_TARGET);
	});

	it("MOBILE_BUILD mirrors the mobile target", () => {
		expect(MOBILE_BUILD).toBe(BUILD_TARGET === "mobile");
	});
});

describe("inMobile", () => {
	it("returns a boolean regardless of runtime", () => {
		expect(typeof inMobile()).toBe("boolean");
	});

	it("does not throw when Capacitor is absent", () => {
		expect(() => inMobile()).not.toThrow();
	});
});
