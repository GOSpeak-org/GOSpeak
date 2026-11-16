import { describe, expect, it } from "vitest";
import { pluginMethod } from "./bridge";

describe("pluginMethod", () => {
	it("joins plugin and method with a dot", () => {
		expect(pluginMethod("AudioSession", "activate")).toBe(
			"AudioSession.activate",
		);
	});

	it("keeps the exact casing of both halves", () => {
		expect(pluginMethod("MediaControl", "setMetadata")).toBe(
			"MediaControl.setMetadata",
		);
	});
});
