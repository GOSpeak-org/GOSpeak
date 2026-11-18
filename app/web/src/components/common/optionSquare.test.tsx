import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OptionSquare from "./optionSquare";

describe("OptionSquare", () => {
	it("activates a double-click-only item with the Enter key", () => {
		const onDoubleClick = vi.fn();
		render(
			<OptionSquare
				label="测试域"
				requiresDoubleClick
				onDoubleClick={onDoubleClick}
			>
				<span>测</span>
			</OptionSquare>,
		);
		fireEvent.keyDown(screen.getByRole("button", { name: "测试域" }), {
			key: "Enter",
		});
		expect(onDoubleClick).toHaveBeenCalledTimes(1);
	});
});
