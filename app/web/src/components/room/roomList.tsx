import { toast, Button, ScrollArea, Skeleton } from "@gospeak/components";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CirclePlus, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomRecord } from "@/api/room";
import { deleteRoom } from "@/api/room";
import Divider from "@/components/common/divider";
import ConfirmModal from "@/components/common/ConfirmModal";
import TooltipIconButton from "@/components/common/tooltipIconButton";
import DomainMenu from "@/components/domain/DomainMenu";
import CreateRoomModal from "@/components/modal/createRoomModal";
import EditRoomModal from "@/components/modal/editRoomModal";
import UserInfoPopover from "@/components/room/components/userInfoPopover";
import { RoomItem } from "@/components/room/components/roomItem";
import {
	toEditRoomRecord,
	visibleRoomsForDomain,
} from "@/components/room/roomListUtils";
import { useDomainStore } from "@/stores/domainStore";
import {
	type RoomInfo,
	socketStore,
	useSocketStore,
} from "@/stores/socketStore";
import type { WSConnectionState } from "@/socket/wsClient";
import { hasPermission } from "@/utils/permissions";
import { useNavigate } from "@tanstack/react-router";
import { apiErrorMessage } from "@/utils/apiError";
import { toastActionError } from "@/utils/toast";

function RoomItemSkeleton() {
	return (
		<div className="flex w-full shrink-0 flex-col">
			<div className="flex items-center justify-between border-0 px-1.5 py-2">
				<div className="flex w-full items-center space-x-1">
					<Skeleton className="h-4 flex-1 rounded-sm" />
				</div>
				<div className="flex items-center text-xs">
					<Skeleton className="h-4 w-8 rounded-sm" />
				</div>
			</div>
		</div>
	);
}

function RoomListLoading({ label }: { label: string }) {
	return (
		<div className="flex flex-col gap-3 py-4" aria-live="polite">
			<RoomItemSkeleton />
			<div className="text-muted-foreground text-center text-xs">{label}</div>
		</div>
	);
}

function RoomListFallback({ state }: { state: WSConnectionState }) {
	// closed 之后 wsClient 立刻按退避重连（首帧就会回到 connecting），
	// 中间这段时间只闪一帧错误态会让用户以为要手动重试；给自动重连一个宽限窗口。
	const [retryVisible, setRetryVisible] = useState(false);
	useEffect(() => {
		if (state !== "closed") {
			setRetryVisible(false);
			return;
		}
		const timer = setTimeout(() => setRetryVisible(true), 4000);
		return () => clearTimeout(timer);
	}, [state]);

	// 首帧 socketState 还是 "new"（connect() 在 effect 里才发出），此时既没连上
	// 也没失败，不能直接当成错误态；只有关掉/关闭中才算真的连不上。
	if (
		state === "new" ||
		state === "connecting" ||
		state === "closing" ||
		(state === "closed" && !retryVisible)
	) {
		return (
			<RoomListLoading
				label={
					state === "closed" ? "连接已断开，正在重连..." : "正在连接服务器..."
				}
			/>
		);
	}
	return (
		<div className="flex flex-col gap-3 py-4" aria-live="polite">
			<div className="text-muted-foreground flex flex-col items-center gap-2 py-2 text-xs">
				<span>连接失败，请检查服务器状态</span>
				<Button variant="ghost" size="sm" onClick={() => socketStore.connect()}>
					重新连接
				</Button>
			</div>
		</div>
	);
}

function RoomListHeader({ onOpenCreate }: { onOpenCreate: () => void }) {
	const currentDomainUUID = socketStore.currentDomainUUID();
	const domainCache = useDomainStore((s) => s.domainCache);
	const currentDomain = domainCache[currentDomainUUID ?? ""];
	return (
		<div className="mt-2 flex justify-between px-2">
			<h3 className="min-w-0 flex-1 truncate font-bold">
				{currentDomain?.name || "选择域"}
			</h3>
			<div className="flex items-center gap-0.5">
				{currentDomain && hasPermission("room:create") && (
					<TooltipIconButton label="新建房间" onClick={onOpenCreate}>
						<CirclePlus size={16} />
					</TooltipIconButton>
				)}
				<TooltipIconButton
					label="刷新房间列表"
					onClick={() => socketStore.listRooms()}
				>
					<RotateCw size={16} />
				</TooltipIconButton>
				{currentDomain && <DomainMenu domainUUID={currentDomain.uuid} />}
			</div>
		</div>
	);
}

export default function RoomList() {
	const queryClient = useQueryClient();
	const _navigate = useNavigate();
	const [selectedMember, setSelectedMember] = useState<{
		identity: string;
		x: number;
		y: number;
	} | null>(null);
	const [editingRoom, setEditingRoom] = useState<RoomInfo | null>(null);
	const [createRoomOpen, setCreateRoomOpen] = useState(false);
	const [deletingRoom, setDeletingRoom] = useState<RoomInfo | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState("");

	// 进入时加载房间列表
	useEffect(() => {
		socketStore.connect();
	}, []);

	const rooms = useSocketStore((s) => s.rooms);
	const connected = useSocketStore((s) => s.connected);
	const socketState = useSocketStore((s) => s.socketState);
	const roomsLoading = useSocketStore((s) => s.roomsLoading);
	const currentRoom = useSocketStore((s) => s.currentRoom);
	const currentDomainUUID = socketStore.currentDomainUUID();
	const visibleRooms = visibleRoomsForDomain(rooms, currentDomainUUID);

	const openCreateRoomModal = () => {
		const domainUUID = socketStore.currentDomainUUID();
		if (!domainUUID) {
			toast.warning("请先选择域");
			return;
		}
		setCreateRoomOpen(true);
	};

	const openDeleteRoom = (room: RoomInfo) => {
		setDeleteError("");
		setDeletingRoom(room);
	};

	const closeDeleteModal = () => {
		setDeletingRoom(null);
		setDeleteError("");
	};

	const handleDeleteRoom = async () => {
		const room = deletingRoom;
		if (!room) return;
		setDeleting(true);
		setDeleteError("");
		try {
			await deleteRoom(room.id);
			closeDeleteModal();
			toast.success("房间已删除");
			socketStore.listRooms();
			queryClient.invalidateQueries({ queryKey: ["my-domains-detailed"] });
		} catch (error) {
			const message = apiErrorMessage(error);
			setDeleteError(message);
			toastActionError(error, "删除房间失败");
		} finally {
			setDeleting(false);
		}
	};

	const handleRoomSaved = (updated: RoomRecord) => {
		const selected = socketStore.selectedRoomInfo();
		if (selected?.id === updated.id) {
			socketStore.selectRoom({
				...selected,
				id: updated.id,
				uuid: updated.uuid,
				name: updated.name,
				domain_uuid: updated.domain_uuid,
				description: updated.description,
				limit: updated.limit,
				audio_only: updated.audio_only,
				allow_audience: updated.allow_audience,
				type: updated.type,
			});
		}
		socketStore.listRooms();
	};

	const viewportRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: connected && visibleRooms.length > 0 ? visibleRooms.length : 0,
		getScrollElement: () => viewportRef.current,
		estimateSize: () => 68,
		overscan: 8,
	});

	return (
		<>
			<div className="box-border flex h-full min-h-0 flex-col select-none">
				<RoomListHeader onOpenCreate={openCreateRoomModal} />
				<Divider className="my-1" />
				{/* 外框留白统一给到 viewport（px-2）：滚动条绝对定位在 ScrollArea 的
				    右边缘，落在留白里而不是压在行上，行盒左右都是 8px，和标题行、
				    底部的语音条/用户栏对齐。 */}
				<ScrollArea
					className="min-h-0 flex-1"
					viewportClassName="px-2 pb-1"
					viewportRef={viewportRef}
				>
					<div
						className="relative flex w-full flex-col"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{connected ? (
							visibleRooms.length > 0 ? (
								virtualizer.getVirtualItems().map((virtualRow) => {
									const room = visibleRooms[virtualRow.index];
									return (
										<div
											key={`${room.domain_uuid}:${room.name}`}
											className="absolute top-0 left-0 w-full"
											style={{ transform: `translateY(${virtualRow.start}px)` }}
										>
											<RoomItem
												room={room}
												isActive={
													currentRoom === room.name &&
													(room.domain_uuid || "") === (currentDomainUUID || "")
												}
												selectedMember={selectedMember}
												onSelectMember={(identity, x, y) =>
													setSelectedMember({ identity, x, y })
												}
												onCloseMember={() => setSelectedMember(null)}
												onEditRoom={setEditingRoom}
												onDeleteRoom={openDeleteRoom}
											/>
										</div>
									);
								})
							) : roomsLoading ? (
								<RoomListLoading label="正在加载房间..." />
							) : (
								<div className="text-faint-foreground flex h-20 items-center justify-center text-xs">
									暂无房间
								</div>
							)
						) : (
							<RoomListFallback state={socketState} />
						)}
					</div>
				</ScrollArea>
			</div>
			<CreateRoomModal
				open={createRoomOpen}
				domainUUID={currentDomainUUID ?? ""}
				onClose={() => setCreateRoomOpen(false)}
			/>
			{editingRoom && (
				<EditRoomModal
					open
					room={toEditRoomRecord(editingRoom)}
					onClose={() => setEditingRoom(null)}
					onSaved={handleRoomSaved}
				/>
			)}
			{deletingRoom && (
				<ConfirmModal
					open
					title="删除房间"
					message={
						<span>
							确认删除房间 {deletingRoom.name}？删除后不可恢复。
							{deleteError && (
								<span className="text-destructive mt-2 block">
									{deleteError}
								</span>
							)}
						</span>
					}
					confirmText="删除"
					loading={deleting}
					onClose={closeDeleteModal}
					onConfirm={handleDeleteRoom}
				/>
			)}
			{selectedMember && (
				<UserInfoPopover
					identity={selectedMember.identity}
					pos={{ x: selectedMember.x, y: selectedMember.y }}
					onClose={() => setSelectedMember(null)}
				/>
			)}
		</>
	);
}
