import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/common/errorBoundary";
import { useErrorHandler } from "./useErrorHandler";

function AsyncAction() {
	const throwError = useErrorHandler();
	const run = async () => {
		await Promise.reject(new Error("async boom")).catch((error: unknown) => {
			throwError(error);
		});
	};
	return (
		<button type="button" onClick={() => void run()}>
			触发异步错误
		</button>
	);
}

describe("useErrorHandler", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("rethrows async errors into the nearest error boundary", async () => {
		render(
			<ErrorBoundary name="async-panel">
				<AsyncAction />
			</ErrorBoundary>,
		);
		const button = screen.getByRole("button", { name: "触发异步错误" });

		await userEvent.click(button);

		const fallback = await screen.findByRole("alert");
		expect(fallback.textContent).toContain("模块加载失败");
		expect(screen.getByText("模块加载失败").textContent).toBe("模块加载失败");
		expect(fallback.textContent).toContain("async boom");
	});
});
