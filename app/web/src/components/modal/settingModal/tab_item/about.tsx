import { Button } from "@gospeak/components";
import { createClientLog, inDesktop } from "@gospeak/desktop";
import { useEffect, useState } from "react";
import { currentEntries } from "@/utils/clientLog";
import { exportLogFile } from "@/utils/exportLog";
import { Page, Section } from "./shared";
import type { SettingTabConfig } from "./types";

type ExportState =
	| { status: "idle" }
	| { status: "working" }
	| { status: "done"; file: string }
	| { status: "error"; message: string };

/**
 * 关于 / 日志。
 *
 * 导出按钮在 Web 与桌面端共用同一个实现（`exportLogFile`），差异只在交付方式：
 * Web 走浏览器下载，桌面端由宿主接管下载并落到下载目录。
 */
function AboutForm() {
	const [state, setState] = useState<ExportState>({ status: "idle" });
	const [count, setCount] = useState(0);
	const [logsPath, setLogsPath] = useState("");
	const desktop = inDesktop();

	useEffect(() => {
		setCount(currentEntries().length);
		if (!desktop) return;
		void createClientLog()
			.logsPath()
			.then(setLogsPath)
			.catch(() => {});
	}, [desktop]);

	const runExport = async () => {
		setState({ status: "working" });
		try {
			const file = await exportLogFile();
			setState({ status: "done", file });
			setCount(currentEntries().length);
		} catch (e) {
			setState({
				status: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	};

	const reveal = async () => {
		try {
			await createClientLog().revealLogs();
		} catch {
			// 宿主不支持时静默；路径本身仍显示在界面上
		}
	};

	return (
		<Page
			title="关于"
			desc="版本信息与客户端日志。遇到问题时导出日志文件附在反馈里，能显著加快定位。"
		>
			<Section title="版本">
				<div className="border-border bg-muted/20 flex flex-col gap-1 rounded-lg border p-4 text-sm">
					<div className="flex items-center justify-between gap-4">
						<span className="text-faint-foreground text-xs">客户端版本</span>
						<span className="font-medium">{__APP_VERSION__}</span>
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-faint-foreground text-xs">运行环境</span>
						<span className="font-medium">{desktop ? "桌面端" : "浏览器"}</span>
					</div>
				</div>
			</Section>

			<Section
				title="客户端日志"
				desc="记录前端错误与宿主日志（各保留最近若干条，7 天后自动过期）。导出为纯文本文件。"
			>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						onClick={() => void runExport()}
						disabled={state.status === "working"}
					>
						{state.status === "working" ? "正在导出…" : "导出日志"}
					</Button>
					{desktop && (
						<Button size="sm" variant="outline" onClick={() => void reveal()}>
							打开日志文件夹
						</Button>
					)}
				</div>

				{state.status === "done" && (
					<p className="text-xs">
						{desktop
							? `已开始下载 ${state.file}，可在下载目录中找到。`
							: `已下载 ${state.file}。`}
					</p>
				)}
				{state.status === "error" && (
					<p className="text-destructive text-xs" title={state.message}>
						导出失败：{state.message}
					</p>
				)}

				<p className="text-faint-foreground text-xs">
					当前已记录 {count} 条{logsPath ? `；宿主日志目录：${logsPath}` : ""}
				</p>
			</Section>
		</Page>
	);
}

const aboutTab: SettingTabConfig = {
	id: "about",
	label: "关于",
	icon: "info",
	component: AboutForm,
};

export default aboutTab;
