import type { RoomRecord } from "@/api/room";
import type { RoomInfo } from "@/socket/types";
import {
	canManageRoom,
	type RoomManagePermission,
} from "@/utils/roomPermissions";

/** 房间标题行 + 虚拟行底部留白：py-2(16) + leading-none text-sm(14) + pb-1(4) */
const ROOM_HEADER_HEIGHT = 34;
/** 成员行：avatar size-6(24) + py-1(8) */
const MEMBER_ROW_HEIGHT = 32;

/**
 * 虚拟列表首屏行高估算。按成员数给出接近真实的高度，
 * 使 measureElement 只需小幅修正，避免内容多时因估算偏差反复重排（漂移）。
 */
export function estimateRoomItemHeight(
	room: Pick<RoomInfo, "members">,
): number {
	return ROOM_HEADER_HEIGHT + (room.members?.length ?? 0) * MEMBER_ROW_HEIGHT;
}

export function visibleRoomsForDomain(
	rooms: RoomInfo[],
	domainUUID: string | null | undefined,
): RoomInfo[] {
	if (!domainUUID) return [];
	return rooms.filter((room) => room.domain_uuid === domainUUID);
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
