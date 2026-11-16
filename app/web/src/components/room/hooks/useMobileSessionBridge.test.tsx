import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileSessionBridge } from "./useMobileSessionBridge";

const m = vi.hoisted(() => ({
	activate: vi.fn(async () => {}),
	deactivate: vi.fn(async () => {}),
	setMetadata: vi.fn(async () => {}),
	clear: vi.fn(async () => {}),
	onAction: vi.fn((_handler: (action: string) => void) => () => {}),
	onStateChange: vi.fn((_handler: (state: string) => void) => () => {}),
	setIsInputMute: vi.fn((_value: boolean) => {}),
	connected: vi.fn(() => true),
	connect: vi.fn(() => {}),
	selectedRoomInfo: vi.fn(() => ({ name: "lobby" })),
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => true,
	createMobile: () => ({
		audioSession: { activate: m.activate, deactivate: m.deactivate },
		mediaControl: {
			setMetadata: m.setMetadata,
			clear: m.clear,
			onAction: m.onAction,
		},
		lifecycle: { onStateChange: m.onStateChange },
	}),
}));

vi.mock("@/stores/socketStore", () => ({
	socketStore: {
		connected: m.connected,
		connect: m.connect,
		selectedRoomInfo: m.selectedRoomInfo,
	},
}));

vi.mock("@/stores/voiceChatStore", () => ({
	useVoiceChatActions: () => ({ setIsInputMute: m.setIsInputMute }),
}));

const baseInput = {
	isJoined: false,
	currentRoom: null as string | null,
	handleManualLeave: () => {},
};

describe("useMobileSessionBridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		m.connected.mockReturnValue(true);
		m.selectedRoomInfo.mockReturnValue({ name: "lobby" });
	});

	it("activates the audio session only while joined", () => {
		const { rerender, unmount } = renderHook(
			({ props }: { props: typeof baseInput }) => useMobileSessionBridge(props),
			{ initialProps: { props: baseInput } },
		);
		expect(m.activate).not.toHaveBeenCalled();
		rerender({ props: { ...baseInput, isJoined: true } });
		expect(m.activate).toHaveBeenCalledTimes(1);
		unmount();
		expect(m.deactivate).toHaveBeenCalledTimes(1);
	});

	it("publishes room metadata to the lock screen", () => {
		renderHook(() =>
			useMobileSessionBridge({
				...baseInput,
				isJoined: true,
				currentRoom: "lobby",
			}),
		);
		expect(m.setMetadata).toHaveBeenCalledWith({
			title: "lobby",
			subtitle: "GOSpeak 语音房间",
		});
	});

	it("maps lock-screen actions to mute and hangup", () => {
		const handleManualLeave = vi.fn();
		renderHook(() =>
			useMobileSessionBridge({ ...baseInput, handleManualLeave }),
		);
		const handler = m.onAction.mock.calls[0]?.[0] as (action: string) => void;
		act(() => handler("mute"));
		expect(m.setIsInputMute).toHaveBeenCalledWith(true);
		act(() => handler("unmute"));
		expect(m.setIsInputMute).toHaveBeenCalledWith(false);
		act(() => handler("hangup"));
		expect(handleManualLeave).toHaveBeenCalledTimes(1);
	});

	it("reconnects signaling when the app returns while disconnected", () => {
		m.connected.mockReturnValue(false);
		renderHook(() => useMobileSessionBridge(baseInput));
		const handler = m.onStateChange.mock.calls[0]?.[0] as (
			state: string,
		) => void;
		act(() => handler("active"));
		expect(m.connect).toHaveBeenCalledTimes(1);
		expect(m.activate).toHaveBeenCalledTimes(1);
	});
});
