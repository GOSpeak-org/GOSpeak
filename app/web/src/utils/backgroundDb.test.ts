import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { deleteBackground, getBackground, putBackground } from "./backgroundDb";

describe("backgroundDb", () => {
	it("round-trips a blob per mode", async () => {
		expect(await getBackground("light")).toBeNull();
		await putBackground("light", new Blob(["abc"], { type: "image/webp" }));
		expect(await getBackground("light")).not.toBeNull();
		expect(await getBackground("dark")).toBeNull();
		await deleteBackground("light");
		expect(await getBackground("light")).toBeNull();
	});

	it("keeps light and dark entries independent", async () => {
		await putBackground("light", new Blob(["l"], { type: "image/webp" }));
		await putBackground("dark", new Blob(["d"], { type: "image/webp" }));
		expect(await getBackground("light")).not.toBeNull();
		expect(await getBackground("dark")).not.toBeNull();
		await deleteBackground("dark");
		expect(await getBackground("dark")).toBeNull();
		expect(await getBackground("light")).not.toBeNull();
	});
});
