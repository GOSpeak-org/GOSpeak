import { toast } from "@gospeak/components";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, CirclePlus, Search, Shuffle } from "lucide-react";
import { useState } from "react";
import CreateRoomModal from "@/components/modal/createRoomModal";
import { socketStore } from "@/stores/socketStore";

interface DiscoverHeroProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (event: React.FormEvent) => void;
}

export default function DiscoverHero(props: DiscoverHeroProps) {
	const navigate = useNavigate();
	const [createRoomOpen, setCreateRoomOpen] = useState(false);
	const [createRoomDomain, setCreateRoomDomain] = useState("");
	const currentDomainUUID = socketStore.currentDomainUUID();

	const handleCreateRoom = () => {
		if (!currentDomainUUID) {
			toast.warning("请先选择域");
			return;
		}
		setCreateRoomDomain(currentDomainUUID);
		setCreateRoomOpen(true);
	};

	const handleJoinRandom = () => {
		if (!currentDomainUUID) {
			toast.warning("请先选择域");
			return;
		}
		const rooms = socketStore
			.rooms()
			.filter(
				(room) =>
					room.count < room.limit &&
					(room.domain_uuid || "") === currentDomainUUID,
			);
		if (rooms.length === 0) {
			toast.warning("当前域没有可加入的房间");
			return;
		}
		const target = [...rooms].sort((a, b) => b.count - a.count)[0];
		socketStore.selectRoom(target);
		if (target.domain_uuid)
			navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: target.domain_uuid },
			});
		else navigate({ to: "/discover" });
	};

	const handleGoDomain = () => {
		if (currentDomainUUID)
			navigate({
				to: "/domain/$domainUUID",
				params: { domainUUID: currentDomainUUID },
			});
		else toast.warning("请先选择域");
	};

	const chipClass =
		"border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-xs transition-colors";

	return (
		<>
			<section className="bg-primary relative overflow-hidden rounded-panel px-6 py-5 md:px-8">
				<div className="relative">
					<h1 className="text-primary-foreground text-xl font-bold">
						找到你的下一个语音房
					</h1>
					<p className="text-primary-foreground/85 mt-0.5 text-sm">
						搜索公开语音域，或粘贴好友的邀请码即刻加入
					</p>
					<form onSubmit={props.onSubmit} className="mt-3 flex max-w-xl gap-2">
						<input
							type="text"
							value={props.value}
							onChange={(e) => props.onChange(e.currentTarget.value)}
							placeholder="搜索域名称 / 描述，或粘贴邀请码…"
							aria-label="搜索公开域或输入邀请码"
							className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/70 h-9 min-w-0 flex-1 rounded-field border px-3 text-sm outline-none"
						/>
						<button
							type="submit"
							className="bg-primary-foreground text-primary inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-field px-4 text-sm font-medium transition-opacity hover:opacity-90"
						>
							<Search size={16} />
							搜索
						</button>
					</form>
					<div className="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							className={chipClass}
							onClick={handleCreateRoom}
						>
							<CirclePlus size={16} />
							快速创建房间
						</button>
						<button
							type="button"
							className={chipClass}
							onClick={handleJoinRandom}
						>
							<Shuffle size={16} />
							随机加入房间
						</button>
						<button
							type="button"
							className={chipClass}
							onClick={handleGoDomain}
						>
							<ArrowUpRight size={16} />
							前往我的域
						</button>
					</div>
				</div>
			</section>
			<CreateRoomModal
				open={createRoomOpen}
				domainUUID={createRoomDomain}
				onClose={() => setCreateRoomOpen(false)}
			/>
		</>
	);
}
