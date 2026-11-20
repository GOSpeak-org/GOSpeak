import type { RoomInfo } from "@/socket/types";
import { describe, expect, test } from "vitest";
import { estimateRoomItemHeight } from "./roomListUtils";

function roomWithMembers(memberCount: number): RoomInfo {
	return {
		members: Array.from({ length: memberCount }, (_, i) => ({
			identity: `u-${i}`,
		})),
	} as unknown as RoomInfo;
}

describe("estimateRoomItemHeight", () => {
	test("空房间只占标题行高度", () => {
		expect(estimateRoomItemHeight(roomWithMembers(0))).toBe(34);
	});

	test("每个成员增加一行成员行高度", () => {
		expect(estimateRoomItemHeight(roomWithMembers(3))).toBe(34 + 3 * 32);
	});

	test("成员越多估算行高越大", () => {
		expect(estimateRoomItemHeight(roomWithMembers(5))).toBeGreaterThan(
			estimateRoomItemHeight(roomWithMembers(1)),
		);
	});
});
