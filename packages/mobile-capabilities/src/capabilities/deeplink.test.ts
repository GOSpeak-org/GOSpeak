import { describe, expect, it } from "vitest";
import { createDeepLink, normalizeDeepLink } from "./deeplink";

describe("normalizeDeepLink", () => {
	it("converts the invite scheme to an in-app path", () => {
		expect(normalizeDeepLink("gospeak://invite/d/ABC123")).toBe(
			"/invite/d/ABC123",
		);
	});

	it("keeps an existing in-app path", () => {
		expect(normalizeDeepLink("/invite/d/ABC123")).toBe("/invite/d/ABC123");
	});

	it("rejects foreign schemes", () => {
		expect(normalizeDeepLink("https://evil.example/invite/d/x")).toBeNull();
	});

	it("rejects non-string input", () => {
		expect(normalizeDeepLink(undefined as unknown as string)).toBeNull();
	});
});

describe("createDeepLink in web fallback", () => {
	it("returns an unsubscribe function", () => {
		const off = createDeepLink().onLink(() => {});
		expect(typeof off).toBe("function");
	});

	it("resolves the initial link to null", async () => {
		await expect(createDeepLink().initial()).resolves.toBeNull();
	});
});
