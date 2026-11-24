import { useCallback } from "react";
import type { SFUClient } from "@gospeak/sfu-client/types";

type Subscription = { identity: string; source: "screen" };

let client: SFUClient | null = null;
let activeSubscription: Subscription | null = null;

export function setScreenShareSubscriptionClient(next: SFUClient | null) {
	if (client !== next && activeSubscription && client) {
		void client.setRemoteVideoSubscribed?.(
			activeSubscription.identity,
			activeSubscription.source,
			false,
		);
	}
	activeSubscription = null;
	client = next;
}

export function resetScreenShareSubscription() {
	if (client && activeSubscription) {
		void client.setRemoteVideoSubscribed?.(
			activeSubscription.identity,
			activeSubscription.source,
			false,
		);
	}
	activeSubscription = null;
	client = null;
}

export function useWatchScreenShare(): {
	watchScreenShare: (identity: string) => Promise<void>;
	stopWatchingScreenShare: () => Promise<void>;
} {
	const watchScreenShare = useCallback(async (identity: string) => {
		const current = client;
		if (!current?.setRemoteVideoSubscribed) return;
		const next: Subscription = { identity, source: "screen" };
		if (activeSubscription?.identity === identity) return;
		if (activeSubscription) {
			await current.setRemoteVideoSubscribed(
				activeSubscription.identity,
				activeSubscription.source,
				false,
			);
		}
		await current.setRemoteVideoSubscribed(next.identity, next.source, true);
		activeSubscription = next;
	}, []);

	const stopWatchingScreenShare = useCallback(async () => {
		const current = client;
		if (!current?.setRemoteVideoSubscribed || !activeSubscription) return;
		const active = activeSubscription;
		await current.setRemoteVideoSubscribed(
			active.identity,
			active.source,
			false,
		);
		activeSubscription = null;
	}, []);

	return { watchScreenShare, stopWatchingScreenShare };
}
