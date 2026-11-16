import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalNotification } from "./local-notification";

const { notificationCtor } = vi.hoisted(() => ({ notificationCtor: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	notificationCtor.mockClear();
});

describe("createLocalNotification in web fallback", () => {
	it("resolves notify without a native runtime", async () => {
		const local = createLocalNotification();
		await expect(
			local.notify({ id: 1, title: "标题", body: "内容" }),
		).resolves.toBeUndefined();
	});

	it("resolves cancel without a native runtime", async () => {
		await expect(createLocalNotification().cancel(1)).resolves.toBeUndefined();
	});

	it("does not throw when notify is called twice", async () => {
		const local = createLocalNotification();
		const options = { id: 1, title: "标题", body: "内容" };
		await expect(local.notify(options)).resolves.toBeUndefined();
		await expect(local.notify(options)).resolves.toBeUndefined();
	});

	it("does not throw when cancel is called with any id", async () => {
		const local = createLocalNotification();
		await expect(local.cancel(0)).resolves.toBeUndefined();
		await expect(local.cancel(-1)).resolves.toBeUndefined();
		await expect(local.cancel(9007199254740991)).resolves.toBeUndefined();
	});

	it("does not touch Notification when the global is absent", async () => {
		vi.stubGlobal("Notification", undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(
			createLocalNotification().notify({ id: 1, title: "t", body: "b" }),
		).resolves.toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
		expect(notificationCtor).not.toHaveBeenCalled();
	});

	it("uses the Web Notification API when available", async () => {
		vi.stubGlobal("Notification", notificationCtor);
		await createLocalNotification().notify({
			id: 7,
			title: "房间邀请",
			body: "快来加入",
		});
		expect(notificationCtor).toHaveBeenCalledWith("房间邀请", {
			body: "快来加入",
		});
	});
});
