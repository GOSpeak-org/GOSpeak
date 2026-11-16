import { describe, expect, it } from "vitest";
import { createMobile } from "./index";

describe("createMobile", () => {
	it("exposes every capability", () => {
		const mobile = createMobile();
		expect(Object.keys(mobile).sort()).toEqual([
			"audioRoute",
			"audioSession",
			"deepLink",
			"lifecycle",
			"mediaControl",
			"push",
			"runtime",
		]);
	});

	it("reports the runtime kind", () => {
		expect(["web", "desktop", "mobile"]).toContain(createMobile().runtime);
	});
});
