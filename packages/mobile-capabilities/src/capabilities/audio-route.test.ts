import { describe, expect, it } from "vitest";
import { createAudioRoute, isAudioRouteKind } from "./audio-route";

describe("isAudioRouteKind", () => {
	it("accepts known routes", () => {
		expect(isAudioRouteKind("speaker")).toBe(true);
		expect(isAudioRouteKind("bluetooth")).toBe(true);
	});

	it("rejects unknown values", () => {
		expect(isAudioRouteKind("airplay")).toBe(false);
		expect(isAudioRouteKind(undefined)).toBe(false);
	});
});

describe("createAudioRoute in web fallback", () => {
	it("defaults to speaker", () => {
		expect(createAudioRoute().current()).toBe("speaker");
	});

	it("returns the default option list", async () => {
		const options = await createAudioRoute().list();
		expect(options.map((o) => o.kind)).toEqual(["speaker", "earpiece"]);
	});

	it("ignores set for an unsupported route", async () => {
		const route = createAudioRoute();
		await route.set("bluetooth");
		expect(route.current()).toBe("speaker");
	});

	it("never throws on set", async () => {
		await expect(createAudioRoute().set("earpiece")).resolves.toBeUndefined();
	});
});
