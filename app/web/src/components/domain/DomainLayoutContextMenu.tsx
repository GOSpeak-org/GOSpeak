import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@gospeak/components";
import { useState, type ReactNode } from "react";
import type { DomainGroup } from "@/api/domainLayout";

interface DomainLayoutContextMenuProps {
	label: string;
	groups: DomainGroup[];
	onMove: (groupUUID: string | null) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	children: ReactNode;
}

export default function DomainLayoutContextMenu({
	label,
	groups,
	onMove,
	onMoveUp,
	onMoveDown,
	children,
}: DomainLayoutContextMenuProps) {
	const [open, setOpen] = useState(false);
	const [point, setPoint] = useState({ x: 0, y: 0 });
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: 右键菜单容器；键盘用户走拖拽排序 */}
			<div
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setPoint({ x: event.clientX + 6, y: event.clientY + 6 });
					setOpen(true);
				}}
			>
				<DropdownMenuTrigger asChild>
					<div
						aria-hidden="true"
						style={{
							position: "fixed",
							left: point.x,
							top: point.y,
							width: 0,
							height: 0,
							pointerEvents: "none",
						}}
					/>
				</DropdownMenuTrigger>
				{children}
			</div>
			<DropdownMenuContent align="start" side="right">
				<DropdownMenuLabel>{label}</DropdownMenuLabel>
				<DropdownMenuItem onSelect={() => onMove(null)}>
					移到未分组
				</DropdownMenuItem>
				{groups.map((group) => (
					<DropdownMenuItem
						key={group.uuid}
						onSelect={() => onMove(group.uuid)}
					>
						移到「{group.name}」
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => onMoveUp()}>上移</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => onMoveDown()}>下移</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
