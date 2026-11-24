import { useCallback } from "react";
import type { SFUClient } from "@gospeak/sfu-client/types";

type Subscription = { identity: string; source: "screen" };

let client: SFUClient | null = null;
let generation = 0;
let activeSubscription: Subscription | null = null;

export function setScreenShareSubscriptionClient(next: SFUClient | null) {
	generation += 1;
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
	setScreenShareSubscriptionClient(null);
}

export function useWatchScreenShare(): {
	watchScreenShare: (identity: string) => Promise<void>;
	stopWatchingScreenShare: () => Promise<void>;
} {
	const watchScreenShare = useCallback(async (identity: string) => {
		const current = client;
		const token = generation;
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
		if (client === current && generation === token) {
			activeSubscription = next;
		}
	}, []);

	const stopWatchingScreenShare = useCallback(async () => {
		const current = client;
		const token = generation;
		if (!current?.setRemoteVideoSubscribed || !activeSubscription) return;
		const active = activeSubscription;
		await current.setRemoteVideoSubscribed(
			active.identity,
			active.source,
			false,
		);
		if (client === current && generation === token) {
			activeSubscription = null;
		}
	}, []);

	return { watchScreenShare, stopWatchingScreenShare };
}
