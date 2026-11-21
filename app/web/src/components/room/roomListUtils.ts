import type { RoomRecord } from "@/api/room";
import type { RoomListLayoutPayload } from "@/protocol/generated/payloads";
import type { RoomInfo } from "@/socket/types";
import {
	canManageRoom,
	type RoomManagePermission,
} from "@/utils/roomPermissions";

export function visibleRoomsForDomain(
	rooms: RoomInfo[],
	domainUUID: string | null | undefined,
): RoomInfo[] {
	if (!domainUUID) return [];
	return rooms.filter((room) => room.domain_uuid === domainUUID);
}

export type SidebarRow =
	| { kind: "group"; uuid: string; name: string }
	| { kind: "room"; room: RoomInfo };

export function groupRoomsForSidebar(
	rooms: RoomInfo[],
	layout: RoomListLayoutPayload,
): SidebarRow[] {
	const groups = [...layout.groups].sort((a, b) => a.sort_order - b.sort_order);
	const byGroup = new Map<string, RoomInfo[]>();
	const ungrouped: RoomInfo[] = [];
	for (const room of rooms) {
		if (room.group_uuid) {
			const list = byGroup.get(room.group_uuid) ?? [];
			list.push(room);
			byGroup.set(room.group_uuid, list);
		} else {
			ungrouped.push(room);
		}
	}
	const sortRooms = (list: RoomInfo[]) =>
		[...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
	const blocks: Array<{
		kind: "group" | "unGrouped";
		uuid: string;
		name: string;
		rooms: RoomInfo[];
	}> = groups.map((g) => ({
		kind: "group" as const,
		uuid: g.uuid,
		name: g.name,
		rooms: sortRooms(byGroup.get(g.uuid) ?? []),
	}));
	blocks.splice(Math.min(layout.ungrouped_position, blocks.length), 0, {
		kind: "unGrouped" as const,
		uuid: "",
		name: "",
		rooms: sortRooms(ungrouped),
	});
	const rows: SidebarRow[] = [];
	for (const block of blocks) {
		if (block.kind === "group") {
			rows.push({ kind: "group", uuid: block.uuid, name: block.name });
		}
		for (const room of block.rooms) rows.push({ kind: "room", room });
	}
	return rows;
}

export function canManageRoomItem(
	room: Pick<RoomInfo, "name" | "domain_uuid" | "created_by">,
	permission: RoomManagePermission,
) {
	return canManageRoom(room, permission);
}
export function toEditRoomRecord(room: RoomInfo): RoomRecord {
	return {
		id: room.id,
		uuid: room.uuid,
		name: room.name,
		description: room.description ?? "",
		limit: room.limit,
		audio_only: room.audio_only ?? true,
		allow_audience: room.allow_audience ?? true,
		type:
			room.type === "text"
				? "text"
				: room.type === "voice"
					? "voice"
					: undefined,
		domain_uuid: room.domain_uuid,
	};
}
