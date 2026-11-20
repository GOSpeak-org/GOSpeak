import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrivateMessageDTO } from "@/api/conversation";

const mocks = vi.hoisted(() => ({
	messages: [] as PrivateMessageDTO[],
}));

vi.mock("@/stores/chatStore", () => ({
	useChatStore: (selector: (s: unknown) => unknown) =>
		selector({
			activeConversationID: "conv-1",
			conversations: [
				{
					conversation_id: "conv-1",
					other_identity: "bob",
					other_display_name: "Bob",
					other_avatar: "",
					last_content: "hello",
					last_sender_identity: "bob",
					last_message_at: 0,
					unread_count: 0,
				},
			],
			pmMessages: { "conv-1": mocks.messages },
			loadingMessages: {},
		}),
	chatStore: { sendDirect: vi.fn() },
}));
vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: () => ({
		getVirtualItems: () =>
			Array.from({ length: mocks.messages.length * 2 }, (_, index) => ({
				index,
				key: index,
				start: index * 40,
			})),
		getTotalSize: () => mocks.messages.length * 144,
		measureElement: vi.fn(),
		scrollToIndex: vi.fn(),
	}),
}));
vi.mock("@/components/common/AsyncState", () => ({
	default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/common/Skeletons", () => ({
	SkeletonListRows: () => null,
}));

import ChatWindow from "./chatWindow";

afterEach(() => {
	cleanup();
	mocks.messages = [];
});

describe("ChatWindow private messages", () => {
	it("renders the message author's avatar image", () => {
		mocks.messages = [
			{
				uuid: "msg-1",
				author_id: "bob",
				author_name: "Bob",
				author_avatar: "/uploads/bob.png",
				content: "hello",
				deleted: false,
				created_at: "2026-11-20T10:00:00Z",
				conversation_id: "conv-1",
			},
		];

		render(<ChatWindow />);

		const avatar = screen.getByRole("img", { name: "Bob" });
		expect(avatar.tagName).toBe("IMG");
		expect(avatar.getAttribute("src")).toBe("/uploads/bob.png");
	});
});
