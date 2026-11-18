import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DomainIcon from "./DomainIcon";

describe("DomainIcon", () => {
	it("renders no button when used as a presentational chip", () => {
		const { container } = render(
			<DomainIcon name="测试域" interactive={false} />,
		);
		expect(container.querySelector("button")).toBeNull();
		expect(container.textContent).toContain("测");
	});

	it("keeps button behavior by default", () => {
		const { container } = render(<DomainIcon name="测试域" />);
		expect(container.querySelectorAll("button")).toHaveLength(1);
	});
});
