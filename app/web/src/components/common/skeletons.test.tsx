import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	LoadingRegion,
	SkeletonCardGrid,
	SkeletonForm,
	SkeletonListRows,
	SkeletonPage,
	SkeletonTableRows,
} from "./Skeletons";

afterEach(cleanup);

describe("Skeletons", () => {
	it("LoadingRegion 暴露 status 语义与读屏文案", () => {
		const { getByRole } = render(
			<LoadingRegion label="正在加载用户">
				<SkeletonTableRows rows={2} cols={3} />
			</LoadingRegion>,
		);
		const region = getByRole("status");
		expect(region.getAttribute("aria-busy")).toBe("true");
		expect(region.getAttribute("aria-label")).toBe("正在加载用户");
	});

	it("SkeletonTableRows 按 rows*cols 渲染占位块", () => {
		const { container } = render(
			<LoadingRegion label="加载">
				<SkeletonTableRows rows={3} cols={4} />
			</LoadingRegion>,
		);
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(
			12,
		);
	});

	it("SkeletonListRows 每行渲染头像 + 两行文字共 3 块", () => {
		const { container } = render(<SkeletonListRows rows={4} />);
		expect(
			container.querySelectorAll('[data-skeleton="list"] > div'),
		).toHaveLength(4);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			12,
		);
	});

	it("SkeletonCardGrid 每张卡渲染头像 + 两行文字 + 底部行共 4 块", () => {
		const { container } = render(<SkeletonCardGrid cards={4} />);
		expect(
			container.querySelectorAll('[data-skeleton="card-grid"] > div'),
		).toHaveLength(4);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			16,
		);
	});

	it("SkeletonForm 每个字段渲染标签 + 输入框共 2 块", () => {
		const { container } = render(<SkeletonForm fields={3} />);
		expect(
			container.querySelectorAll('[data-skeleton="form"] > div'),
		).toHaveLength(3);
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
			6,
		);
	});

	it("SkeletonPage 保留页面加载骨架的可访问性契约", () => {
		const { getByRole } = render(<SkeletonPage />);
		const region = getByRole("status");
		expect(region.getAttribute("aria-label")).toBe("页面加载中");
		expect(region.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
	});
});
