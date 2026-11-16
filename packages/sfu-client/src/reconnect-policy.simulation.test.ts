import { describe, expect, it } from "vitest";
import {
	createReconnectPolicy,
	DEFAULT_RECONNECT_BASE_DELAY_MS,
	DEFAULT_RECONNECT_BUDGET_MS,
} from "./reconnect-policy";

/**
 * 弱网基线（CI 可跑）：把真实弱网场景压成时间线。
 *
 * 取向是快速失败——15s 内接不回来就交回上层完整 re-join，
 * 所以这里断言的是「不会无限磨」，而不是「能一直救」。
 */
describe("reconnect policy under weak-network timelines", () => {
	it("fails fast instead of grinding when the network stays broken", () => {
		const decide = createReconnectPolicy({
			isOnline: () => true,
			jitterRatio: 0,
		});

		let retryCount = 0;
		let elapsedMs = 0;
		let exhaustedAtMs: number | null = null;

		while (retryCount < 100) {
			const decision = decide({ retryCount, elapsedMs });
			if (decision.delayMs === null) {
				exhaustedAtMs = elapsedMs;
				break;
			}
			elapsedMs += decision.delayMs;
			retryCount += 1;
		}

		expect(exhaustedAtMs).not.toBeNull();
		expect(exhaustedAtMs as number).toBeGreaterThanOrEqual(
			DEFAULT_RECONNECT_BUDGET_MS,
		);
		// 快速失败的关键：不会再尝试十几次
		expect(retryCount).toBeLessThanOrEqual(10);
	});

	it("recovers on the first retry for a short tunnel", () => {
		const decide = createReconnectPolicy({
			isOnline: () => true,
			jitterRatio: 0,
		});

		// 3s 抖动，完全落在预算内
		let elapsedMs = 0;
		let retryCount = 0;
		const attempts: number[] = [];
		while (elapsedMs < 3_000) {
			const decision = decide({ retryCount, elapsedMs });
			expect(decision.reason).toBe("retry");
			attempts.push(decision.delayMs as number);
			elapsedMs += decision.delayMs as number;
			retryCount += 1;
		}

		expect(attempts.length).toBeLessThanOrEqual(4);
		expect(attempts[0]).toBe(DEFAULT_RECONNECT_BASE_DELAY_MS);
	});

	it("keeps a slow steady cadence while offline", () => {
		const decide = createReconnectPolicy({
			isOnline: () => false,
			jitterRatio: 0,
		});

		const offlineDecisions = [0, 2_000, 4_000, 6_000].map((elapsedMs, index) =>
			decide({ retryCount: index, elapsedMs }),
		);

		expect(offlineDecisions.every((d) => d.reason === "offline")).toBe(true);
		// 离线时不指数增长，始终是同一个慢速节奏
		const delays = new Set(offlineDecisions.map((d) => d.delayMs));
		expect(delays.size).toBe(1);
	});

	it("survives repeated short offline/online flapping inside one budget", () => {
		let online = false;
		const decide = createReconnectPolicy({
			isOnline: () => online,
			jitterRatio: 0,
		});

		// 离线 2s → 恢复 → 再离线 2s → 恢复，总耗时仍远小于预算
		expect(decide({ retryCount: 0, elapsedMs: 0 }).reason).toBe("offline");
		online = true;
		expect(decide({ retryCount: 1, elapsedMs: 2_000 })).toEqual({
			delayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
			reason: "retry",
		});

		online = false;
		expect(decide({ retryCount: 2, elapsedMs: 4_000 }).reason).toBe("offline");
		online = true;
		expect(decide({ retryCount: 3, elapsedMs: 4_000 })).toEqual({
			delayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
			reason: "retry",
		});
	});
});
