import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomInfo } from "@/stores/socketStore";
import { RoomItem } from "./roomItem";

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
	value: ResizeObserverStub,
	writable: true,
});

const mocks = vi.hoisted(() => ({
	inMobile: false,
	selectRoom: vi.fn(),
	canManage: false,
}));

vi.mock("@gospeak/mobile-capabilities", () => ({
	inMobile: () => mocks.inMobile,
}));
vi.mock("@gospeak/components", () => ({
	Badge: ({ count, title }: { count: number; title?: string }) => (
		<span title={title}>{count}</span>
	),
}));
vi.mock("@/stores/chatStore", () => ({
	useChatStore: (selector: (s: unknown) => unknown) =>
		selector({ unreadByRoom: {} }),
	chatStore: {
		textRoom: () => null,
		textRoomName: () => null,
		joinTextRoom: vi.fn(),
		leaveTextRoom: vi.fn(),
	},
}));
vi.mock("@/stores/socketStore", () => ({
	useSocketStore: () => ({}),
	socketStore: {
		selectedRoomInfo: () => null,
		currentRoom: () => null,
		currentDomainUUID: () => null,
		selectRoom: (...args: unknown[]) => mocks.selectRoom(...args),
		leaveRoom: vi.fn().mockResolvedValue(undefined),
		clearCurrentRoom: vi.fn(),
		clearSelectedRoom: vi.fn(),
	},
}));
vi.mock("@/utils/toast", () => ({ toastActionError: vi.fn() }));
vi.mock("../roomListUtils", () => ({
	canManageRoomItem: () => mocks.canManage,
}));
vi.mock("./memberItemButton", () => ({ default: () => null }));
vi.mock("./passwordModal", () => ({ default: () => null }));

const baseRoom: RoomInfo = {
	id: 1,
	uuid: "room-1",
	name: "大厅",
	domain_uuid: "domain-1",
	has_password: false,
	limit: 10,
	type: "voice",
	members: [],
	count: 0,
};

let narrowViewport = false;

function renderRoom(overrides: Partial<RoomInfo> = {}) {
	return render(
		<RoomItem
			room={{ ...baseRoom, ...overrides }}
			isActive={false}
			selectedMember={null}
			onSelectMember={() => {}}
			onCloseMember={() => {}}
			onEditRoom={() => {}}
			onDeleteRoom={() => {}}
		/>,
	);
}

function roomButton(): HTMLButtonElement {
	return screen.getByText("大厅").closest("button") as HTMLButtonElement;
}

beforeEach(() => {
	mocks.inMobile = false;
	mocks.canManage = false;
	mocks.selectRoom.mockReset();
	narrowViewport = false;
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: (query: string) =>
			({
				matches: narrowViewport && query.includes("max-width"),
				media: query,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as unknown as MediaQueryList,
	});
});

afterEach(cleanup);

describe("RoomItem / 移动端单击进入", () => {
	it("移动端单击直接进房，且不弹「双击进入」提示", () => {
		mocks.inMobile = true;
		renderRoom();

		fireEvent.click(roomButton(), { detail: 1 });

		expect(mocks.selectRoom).toHaveBeenCalledTimes(1);
		expect(mocks.selectRoom).toHaveBeenCalledWith(
			expect.objectContaining({ name: "大厅" }),
		);
		expect(screen.queryByText("双击进入")).toBeNull();
	});

	it("桌面宽屏单击只提示双击，双击才进房", () => {
		mocks.inMobile = false;
		narrowViewport = false;
		renderRoom();

		fireEvent.click(roomButton(), { detail: 1 });
		expect(mocks.selectRoom).not.toHaveBeenCalled();
		expect(screen.getByText("双击进入")).toBeTruthy();

		fireEvent.doubleClick(roomButton());
		expect(screen.queryByText("双击进入")).toBeNull();
		expect(mocks.selectRoom).toHaveBeenCalledTimes(1);
	});

	it("桌面窄窗口沿用单击进房（响应式宽度）", () => {
		mocks.inMobile = false;
		narrowViewport = true;
		renderRoom();

		fireEvent.click(roomButton(), { detail: 1 });

		expect(mocks.selectRoom).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("双击进入")).toBeNull();
	});
});

describe("RoomItem / 移动端触控适配", () => {
	it("保留原有 count/limit 人数展示（不改动信息语义）", () => {
		renderRoom({ count: 0, limit: 0 });

		expect(screen.getByText("0/0")).toBeTruthy();
	});

	it("有人数时照常显示 count/limit", () => {
		renderRoom({ count: 2, limit: 10 });

		expect(screen.getByText("2/10")).toBeTruthy();
	});

	it("主行与更多操作按钮保持不小于 44px 的触控目标", () => {
		const { container } = renderRoom();
		const buttons = container.querySelectorAll("button");

		expect(buttons[0].className).toContain("min-h-11");
		expect(buttons[1].className).toContain("size-11");
	});
});
