import type { RoomRecord } from "@/api/room";
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
