import { beforeEach, describe, expect, it, vi } from "vitest";

const rooms: Array<{ options: Record<string, any> }> = [];

vi.mock("livekit-client", () => {
	class Room {
		static instances: Room[] = [];
		options: Record<string, any>;
		state = "connected";
		localParticipant = {
			setMicrophoneEnabled: async () => {},
			setCameraEnabled: async () => {},
			setScreenShareEnabled: async () => {},
			trackPublications: new Map(),
			getTrackPublication: () => undefined,
		};
		remoteParticipants = new Map();
		constructor(options: Record<string, any>) {
			this.options = options;
			Room.instances.push(this);
			rooms.push(this as never);
		}
		on() {
			return this;
		}
		removeAllListeners() {}
		async disconnect() {}
	}
	return {
		Room,
		RoomEvent: {
			Disconnected: "disconnected",
			Reconnecting: "reconnecting",
			Reconnected: "reconnected",
			ActiveSpeakersChanged: "activeSpeakersChanged",
			TrackSubscribed: "trackSubscribed",
			TrackUnsubscribed: "trackUnsubscribed",
			LocalTrackPublished: "localTrackPublished",
			LocalTrackUnpublished: "localTrackUnpublished",
		},
		LogLevel: { warn: "warn" },
		setLogLevel: () => {},
		DisconnectReason: { DUPLICATE_IDENTITY: "DUPLICATE_IDENTITY" },
		Track: {
			Kind: { Audio: "audio", Video: "video" },
			Source: { ScreenShare: "screen_share" },
		},
		VideoPresets: { h720: { resolution: { width: 1280, height: 720 } } },
	};
});

describe("LiveKit reconnect wiring", () => {
	beforeEach(() => {
		rooms.length = 0;
	});

	it("keeps reconnecting past three attempts by using a time budget", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => true });

		const policy = rooms[0].options.reconnectPolicy;
		for (const retryCount of [3, 4]) {
			const delay = policy.nextRetryDelayInMs({
				retryCount,
				elapsedMs: retryCount * 1200,
			});
			expect(typeof delay).toBe("number");
			expect(delay).toBeGreaterThan(0);
		}
	});

	it("stops auto-reconnect once the time budget is exhausted", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => true });

		const policy = rooms[0].options.reconnectPolicy;
		expect(
			policy.nextRetryDelayInMs({ retryCount: 1, elapsedMs: 120_000 }),
		).toBeNull();
	});

	it("falls back to a slow retry cadence while the browser reports offline", async () => {
		const { LiveKitSFUClient } = await import("./livekit-client");
		new LiveKitSFUClient({ isOnline: () => false });

		const policy = rooms[0].options.reconnectPolicy;
		const shallow = policy.nextRetryDelayInMs({ retryCount: 0, elapsedMs: 0 });
		const deep = policy.nextRetryDelayInMs({ retryCount: 4, elapsedMs: 5_000 });

		// 离线时退避不再指数增长：始终是同一个慢速节奏
		expect(shallow).toBeGreaterThan(0);
		expect(deep).toBe(shallow);
	});
});
