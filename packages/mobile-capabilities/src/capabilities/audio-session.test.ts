import { describe, expect, it } from "vitest";
import { createAudioSession } from "./audio-session";

describe("createAudioSession in web fallback", () => {
	it("resolves activate without a native runtime", async () => {
		const session = createAudioSession();
		await expect(session.activate()).resolves.toBeUndefined();
	});

	it("resolves deactivate without a native runtime", async () => {
		const session = createAudioSession();
		await expect(session.deactivate()).resolves.toBeUndefined();
	});

	it("reports inactive by default", () => {
		expect(createAudioSession().isActive()).toBe(false);
	});

	it("tracks active state after activate in fallback", async () => {
		const session = createAudioSession();
		await session.activate();
		expect(session.isActive()).toBe(true);
	});

	it("never throws when deactivated twice", async () => {
		const session = createAudioSession();
		await session.activate();
		await session.deactivate();
		await expect(session.deactivate()).resolves.toBeUndefined();
	});
});
