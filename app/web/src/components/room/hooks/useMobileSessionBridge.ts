/**
 * 移动原生能力与语音会话的桥接。
 *
 * 放在 VoiceSessionProvider 而非 useVoiceSession：后者是锁定的会话编排器，
 * 只负责 join/leave 与 SFU 媒体；本桥接属于宿主层接入，且 Provider 不随主舞台
 * 切换卸载，订阅得以常驻。
 */
import {
	createMobile,
	inMobile,
	type MediaAction,
} from "@gospeak/mobile-capabilities";
import { useEffect, useMemo } from "react";
import { socketStore } from "@/stores/socketStore";
import { useVoiceChatActions } from "@/stores/voiceChatStore";

interface MobileSessionBridgeInput {
	isJoined: boolean;
	currentRoom: string | null;
	handleManualLeave: () => void | Promise<void>;
}

export function useMobileSessionBridge({
	isJoined,
	currentRoom,
	handleManualLeave,
}: MobileSessionBridgeInput): void {
	const mobile = useMemo(() => createMobile(), []);
	const { setIsInputMute } = useVoiceChatActions();

	// 只跟随加入态：切房不重建音频会话，避免锁屏播放被打断
	useEffect(() => {
		if (!inMobile()) return;
		const { audioSession } = mobile;
		if (!isJoined) return;
		void audioSession.activate();
		return () => {
			void audioSession.deactivate();
		};
	}, [mobile, isJoined]);

	useEffect(() => {
		if (!inMobile()) return;
		const { mediaControl } = mobile;
		if (!isJoined || !currentRoom) return;
		void mediaControl.setMetadata({
			title: currentRoom,
			subtitle: "GOSpeak 语音房间",
		});
		return () => {
			void mediaControl.clear();
		};
	}, [mobile, isJoined, currentRoom]);

	useEffect(() => {
		if (!inMobile()) return;
		const { mediaControl } = mobile;
		return mediaControl.onAction((action: MediaAction) => {
			switch (action) {
				case "mute":
					setIsInputMute(true);
					break;
				case "unmute":
					setIsInputMute(false);
					break;
				case "hangup":
					handleManualLeave();
					break;
			}
		});
	}, [mobile, setIsInputMute, handleManualLeave]);

	useEffect(() => {
		if (!inMobile()) return;
		const { lifecycle, audioSession } = mobile;
		return lifecycle.onStateChange((state) => {
			if (state !== "active") return;
			if (!socketStore.connected()) socketStore.connect();
			if (socketStore.selectedRoomInfo()) void audioSession.activate();
		});
	}, [mobile]);
}
