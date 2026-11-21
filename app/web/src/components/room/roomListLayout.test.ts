import { describe, expect, it } from "vitest";
import type { RoomListLayoutPayload } from "@/protocol/generated/payloads";
import type { RoomInfo } from "@/socket/types";
import { groupRoomsForSidebar } from "./roomListUtils";

function room(
	uuid: string,
	name: string,
	groupUUID?: string,
	sortOrder = 0,
): RoomInfo {
	return {
		id: 1,
		uuid,
		name,
		has_password: false,
		limit: 10,
		members: [],
		count: 0,
		group_uuid: groupUUID,
		sort_order: sortOrder,
	};
}

const layout: RoomListLayoutPayload = {
	groups: [{ uuid: "g1", name: "常用", sort_order: 0 }],
	ungrouped_position: 0,
};

describe("groupRoomsForSidebar", () => {
	it("未分组区块位于指定位置且组内按 sort_order 排序", () => {
		const rooms = [
			room("r1", "a", "g1", 0),
			room("r2", "b", "g1", 1),
			room("r3", "c"),
		];
		const rows = groupRoomsForSidebar(rooms, layout);
		const flat = rows.map((row) =>
			row.kind === "group" ? `group:${row.name}` : `room:${row.room.uuid}`,
		);
		expect(flat).toEqual(["room:r3", "group:常用", "room:r1", "room:r2"]);
	});

	it("未分组区块在分组之后时顺序正确", () => {
		const rooms = [room("r1", "a", "g1", 0), room("r3", "c")];
		const rows = groupRoomsForSidebar(rooms, {
			...layout,
			ungrouped_position: 1,
		});
		expect(rows[0]).toMatchObject({ kind: "group", name: "常用" });
		expect(rows[rows.length - 1]).toMatchObject({
			kind: "room",
			room: { uuid: "r3" },
		});
	});

	it("空布局时全部房间作为未分组平铺", () => {
		const rows = groupRoomsForSidebar([room("r1", "a")], {
			groups: [],
			ungrouped_position: 0,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "room", room: { uuid: "r1" } });
	});
});
