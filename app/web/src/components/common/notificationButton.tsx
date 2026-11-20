import { Badge } from "@gospeak/components";
import { Bell } from "lucide-react";
import {
	notificationStore,
	useNotificationStore,
} from "@/stores/notificationStore";

/** 顶栏通知入口：铃铛 + 未读数字徽章，点击打开通知弹窗。 */
export default function NotificationButton() {
	const unreadCount = useNotificationStore((s) => s.unreadCount);

	return (
		<button
			type="button"
			className="hover:bg-muted flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors"
			onClick={() => notificationStore.openModal()}
			title="通知"
			aria-label="通知"
		>
			<span className="relative inline-flex">
				<Bell className="size-4" strokeWidth={1.5} />
				{unreadCount > 0 && (
					<span className="absolute -top-1.5 -right-2">
						<Badge count={unreadCount} />
					</span>
				)}
			</span>
		</button>
	);
}
