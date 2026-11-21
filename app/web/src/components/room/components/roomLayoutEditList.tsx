import { Button } from "@gospeak/components";
import {
	DndContext,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { RoomInfo } from "@/socket/types";

export type EditBlock = {
	uuid: string;
	name: string;
	rooms: RoomInfo[];
};

function SortableHandle({ id }: { id: string }) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id });
	return (
		<button
			ref={setNodeRef}
			type="button"
			aria-label="拖拽排序"
			style={{
				transform: transform
					? `translate3d(${transform.x}px, ${transform.y}px, 0)`
					: undefined,
				transition,
			}}
			className="text-muted-foreground cursor-grab px-1"
			{...attributes}
			{...listeners}
		>
			<GripVertical size={12} />
		</button>
	);
}

function SortableRoom({ room }: { room: RoomInfo }) {
	const { setNodeRef, transform, transition } = useSortable({
		id: `room:${room.uuid}`,
	});
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: transform
					? `translate3d(${transform.x}px, ${transform.y}px, 0)`
					: undefined,
				transition,
			}}
			className="flex items-center gap-1 py-0.5 text-xs"
		>
			<SortableHandle id={`room:${room.uuid}`} />
			<span className="min-w-0 flex-1 truncate">{room.name}</span>
		</div>
	);
}

export default function RoomLayoutEditList({
	blocks,
	onChange,
	onSave,
	saving,
}: {
	blocks: EditBlock[];
	onChange: (blocks: EditBlock[]) => void;
	onSave: () => void;
	saving: boolean;
}) {
	const sensors = useSensors(useSensor(PointerSensor));
	const onDragEnd = (event: DragEndEvent) => {
		if (!event.over || event.active.id === event.over.id) return;
		const activeId = String(event.active.id);
		const overId = String(event.over.id);
		const next = blocks.map((b) => ({ ...b, rooms: [...b.rooms] }));
		const findRoomBlock = (uuid: string) =>
			next.findIndex((b) => b.rooms.some((r) => r.uuid === uuid));
		if (activeId.startsWith("block:") && overId.startsWith("block:")) {
			const from = next.findIndex((b) => `block:${b.uuid}` === activeId);
			const to = next.findIndex((b) => `block:${b.uuid}` === overId);
			if (from < 0 || to < 0) return;
			const [moved] = next.splice(from, 1);
			next.splice(to, 0, moved);
			onChange(next);
			return;
		}
		if (activeId.startsWith("room:") && overId.startsWith("room:")) {
			const roomUUID = activeId.slice(5);
			const overUUID = overId.slice(5);
			const from = findRoomBlock(roomUUID);
			const to = findRoomBlock(overUUID);
			if (from < 0 || to < 0) return;
			const idx = next[from].rooms.findIndex((r) => r.uuid === roomUUID);
			const [room] = next[from].rooms.splice(idx, 1);
			const at = next[to].rooms.findIndex((r) => r.uuid === overUUID);
			next[to].rooms.splice(at < 0 ? next[to].rooms.length : at, 0, room);
			onChange(next);
			return;
		}
		if (activeId.startsWith("room:") && overId.startsWith("block:")) {
			const roomUUID = activeId.slice(5);
			const from = findRoomBlock(roomUUID);
			const to = next.findIndex((b) => `block:${b.uuid}` === overId);
			if (from < 0 || to < 0 || from === to) return;
			const idx = next[from].rooms.findIndex((r) => r.uuid === roomUUID);
			const [room] = next[from].rooms.splice(idx, 1);
			next[to].rooms.push(room);
			onChange(next);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={onDragEnd}
			>
				<SortableContext
					items={blocks.map((b) => `block:${b.uuid}`)}
					strategy={verticalListSortingStrategy}
				>
					{blocks.map((block) => (
						<div
							key={block.uuid}
							className="border-border/70 rounded-sm border px-1 py-1"
						>
							<div className="flex items-center gap-1">
								<SortableHandle id={`block:${block.uuid}`} />
								<span className="text-muted-foreground flex-1 text-xs font-semibold">
									{block.name}
								</span>
							</div>
							<SortableContext
								items={block.rooms.map((r) => `room:${r.uuid}`)}
								strategy={verticalListSortingStrategy}
							>
								{block.rooms.map((room) => (
									<SortableRoom key={room.uuid} room={room} />
								))}
							</SortableContext>
						</div>
					))}
				</SortableContext>
			</DndContext>
			<Button type="button" size="xs" disabled={saving} onClick={onSave}>
				保存布局
			</Button>
		</div>
	);
}
