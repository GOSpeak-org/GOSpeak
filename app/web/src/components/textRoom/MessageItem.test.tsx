import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageDTO } from "@/types/message";
import MessageItem from "./MessageItem";

const msg: MessageDTO = {
	uuid: "m-1",
	room_uuid: "r-1",
	author_id: "alice",
	author_name: "Alice",
	content: "hello",
	deleted: false,
	created_at: new Date().toISOString(),
};

function stubMatchMedia(matches: boolean) {
	vi.spyOn(window, "matchMedia").mockImplementation(
		(query: string) =>
			({
				matches,
				media: query,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as unknown as MediaQueryList,
	);
}

describe("MessageItem 操作条", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("触屏上是常驻入口：点开、再点收起", () => {
		stubMatchMedia(true);
		render(<MessageItem msg={msg} />);
		const reply = screen.getByRole("button", { name: "回复" });
		expect(reply.parentElement?.className).toContain("invisible");

		fireEvent.click(screen.getByRole("button", { name: "消息操作" }));
		expect(reply.parentElement?.className).not.toContain("invisible");

		fireEvent.click(screen.getByRole("button", { name: "消息操作" }));
		expect(reply.parentElement?.className).toContain("invisible");
	});

	it("桌面保留 hover 展开，也不额外渲染触屏入口", () => {
		stubMatchMedia(false);
		render(<MessageItem msg={msg} />);
		const reply = screen.getByRole("button", { name: "回复" });
		expect(reply.parentElement?.className).toContain("group-hover:visible");
		expect(screen.queryByRole("button", { name: "消息操作" })).toBeNull();
	});
});
