import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainGroup } from "@/api/domainLayout";
import DomainGroupTile from "./DomainGroupTile";

Object.defineProperty(globalThis, "ResizeObserver", {
	value: class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
	writable: true,
});

vi.mock("@dnd-kit/core", () => ({
	useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));
vi.mock("@dnd-kit/sortable", () => ({
	SortableContext: ({ children }: { children: React.ReactNode }) => children,
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: vi.fn(),
		transform: null,
		isDragging: false,
	}),
	verticalListSortingStrategy: {},
}));

const group: DomainGroup = {
	uuid: "g1",
	name: "工作",
	color: "lime",
	sort_order: 0,
};

function renderTile(
	overrides: Partial<React.ComponentProps<typeof DomainGroupTile>> = {},
) {
	const props = {
		group,
		domains: [],
		groups: [group],
		activeDomainUUID: null,
		canMoveUp: false,
		canMoveDown: false,
		onRename: vi.fn(),
		onRecolor: vi.fn(),
		onDelete: vi.fn(),
		onMoveUp: vi.fn(),
		onMoveDown: vi.fn(),
		onSelectDomain: vi.fn(),
		onMoveTo: vi.fn(),
		onReorder: vi.fn(),
		...overrides,
	};
	return { props, ...render(<DomainGroupTile {...props} />) };
}

describe("DomainGroupTile", () => {
	afterEach(cleanup);

	it("opens the edit panel on right click with name, colors and delete", () => {
		renderTile();
		fireEvent.contextMenu(screen.getByLabelText("打开分组 工作"), {
			clientX: 120,
			clientY: 240,
		});
		expect(screen.getByLabelText("分组名称")).toBeTruthy();
		expect(screen.getByRole("group", { name: "分组颜色" })).toBeTruthy();
		expect(screen.getByText("删除分组")).toBeTruthy();
	});

	it("opens the contents view on left click", () => {
		renderTile();
		fireEvent.click(screen.getByLabelText("打开分组 工作"), {
			clientX: 120,
			clientY: 240,
		});
		expect(screen.queryByLabelText("分组名称")).toBeNull();
		expect(screen.getByText(/空分组/)).toBeTruthy();
	});

	it("does not offer a delete entry for domains", () => {
		renderTile();
		fireEvent.contextMenu(screen.getByLabelText("打开分组 工作"));
		expect(screen.queryByText("删除域")).toBeNull();
	});
});
