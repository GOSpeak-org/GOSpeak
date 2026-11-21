import { Button } from "@gospeak/components";
import { GripVertical, Save } from "lucide-react";

export default function RoomLayoutEditBar({
	editing,
	saving,
	onToggle,
	onSave,
}: {
	editing: boolean;
	saving: boolean;
	onToggle: () => void;
	onSave: () => void;
}) {
	return (
		<div className="flex items-center gap-0.5">
			<Button
				type="button"
				size="xs"
				variant={editing ? "outline" : "ghost"}
				aria-label={editing ? "退出编辑布局" : "编辑布局"}
				onClick={onToggle}
			>
				<GripVertical size={14} />
			</Button>
			{editing && (
				<Button
					type="button"
					size="xs"
					disabled={saving}
					aria-label="保存布局"
					onClick={onSave}
				>
					<Save size={14} />
				</Button>
			)}
		</div>
	);
}
