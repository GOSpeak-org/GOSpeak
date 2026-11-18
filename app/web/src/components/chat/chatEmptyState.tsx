import type { ConversationDTO } from "@/api/conversation";
import Avatar from "@/components/common/avatar";
import { chatStore, useChatStore } from "@/stores/chatStore";
import { MessageSquareText } from "lucide-react";

/**
 * 聊天主区空态：未选中会话时替代原先漂浮的一行文字。
 * 结构与语音域 VoiceEmptyState 保持一致（圆图标 + 标题 + 说明 + 直达列表），
 * 让两个主工作区在同一套视觉语言下呈现。
 */
function ConversationPicker({
	conversations,
}: {
	conversations: ConversationDTO[];
}) {
	if (conversations.length === 0) return null;

	return (
		<div className="mt-1 flex w-full max-w-xs flex-col gap-1.5">
			{conversations.map((conv) => (
				<button
					key={conv.conversation_id}
					type="button"
					onClick={() => chatStore.selectConversation(conv.conversation_id)}
					title={`进入与 ${conv.other_display_name || conv.other_identity} 的会话`}
					className="bg-muted border-border hover:bg-muted flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors"
				>
					<Avatar
						src={conv.other_avatar}
						name={conv.other_identity}
						className="size-6 shrink-0"
						textClass="text-2xs"
					/>
					<span className="text-foreground min-w-0 flex-1 truncate text-sm">
						{conv.other_display_name || conv.other_identity}
					</span>
					{conv.last_content && (
						<span className="text-muted-foreground max-w-24 shrink-0 truncate text-xs">
							{conv.last_content}
						</span>
					)}
					{conv.unread_count > 0 && (
						<span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-2xs">
							{conv.unread_count > 99 ? "99+" : conv.unread_count}
						</span>
					)}
				</button>
			))}
		</div>
	);
}

export default function ChatEmptyState() {
	const conversations = useChatStore((s) => s.conversations);
	const loadingList = useChatStore((s) => s.loadingList);
	const recent = conversations.slice(0, 6);

	return (
		<div className="bg-card flex h-full flex-col items-center justify-center gap-3 px-6 text-center select-none">
			<div className="bg-muted border-border flex size-16 items-center justify-center rounded-full border">
				<MessageSquareText
					size={32}
					strokeWidth={1.5}
					className="text-foreground"
				/>
			</div>
			<h2 className="text-foreground text-lg font-bold">选择一个会话</h2>
			<p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
				{loadingList
					? "正在加载会话…"
					: recent.length > 0
						? "点下面的会话直接进入，切换会话不会清空聊天记录。"
						: "在右侧成员列表点击成员，即可发起私聊。"}
			</p>
			<ConversationPicker conversations={recent} />
		</div>
	);
}
