import { Button } from "@gospeak/components";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Palette, UserRound } from "lucide-react";
import { useState } from "react";
import { inMobile } from "@gospeak/mobile-capabilities";
import ServerUrlField from "@/components/common/serverUrlField";
import { clearSessionForServerSwitch } from "@/components/mobile/serverSwitch";
import { useUserStore } from "@/stores/userStore";

/** 移动端专有设置页：重点是服务器地址可改，其余项先简洁呈现。 */
export default function SettingsPage() {
	const navigate = useNavigate();
	const user = useUserStore((s) => s.user);
	const logout = useUserStore((s) => s.logout);
	const [loggingOut, setLoggingOut] = useState(false);
	const mobile = inMobile();

	const doLogout = async () => {
		setLoggingOut(true);
		try {
			await logout();
		} finally {
			setLoggingOut(false);
			navigate({ to: "/login", replace: true });
		}
	};

	return (
		<div className="bg-muted flex h-full flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
			<header className="border-border bg-card sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-2">
				<button
					type="button"
					aria-label="返回"
					className="hover:bg-muted flex size-9 cursor-pointer items-center justify-center rounded-sm transition-colors"
					onClick={() => navigate({ to: "/discover" })}
				>
					<ArrowLeft size={20} />
				</button>
				<h1 className="text-base font-semibold">设置</h1>
			</header>

			<div className="flex flex-col gap-3 p-3">
				<section className="bg-card border-border rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-semibold">服务器</h2>
					<ServerUrlField
						mobile={mobile}
						onBeforeSwitch={clearSessionForServerSwitch}
					/>
					<p className="text-faint-foreground mt-3 text-xs">
						切换服务器会清除当前登录会话并重新加载客户端，请使用新服务器的账号重新登录。
					</p>
				</section>

				<section className="bg-card border-border rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-semibold">外观</h2>
					<div className="text-muted-foreground flex items-center gap-2 text-sm">
						<Palette size={16} />
						<span>主题</span>
						<span className="text-faint-foreground ml-auto text-xs">
							跟随系统
						</span>
					</div>
				</section>

				<section className="bg-card border-border rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-semibold">账号</h2>
					<div className="flex items-center gap-3">
						<UserRound className="text-muted-foreground" size={28} />
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium">
								{user?.display_name || user?.name || "未登录"}
							</div>
							<div className="text-faint-foreground text-xs">
								{user?.role ?? ""}
							</div>
						</div>
					</div>
					<Button
						variant="outline"
						className="mt-4 w-full"
						disabled={loggingOut || !user}
						onClick={() => void doLogout()}
					>
						<LogOut size={16} />
						{loggingOut ? "退出中…" : "退出登录"}
					</Button>
				</section>
			</div>
		</div>
	);
}
