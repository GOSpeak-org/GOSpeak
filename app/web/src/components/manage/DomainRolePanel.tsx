import { Checkbox } from "@gospeak/components";
import clsx from "clsx";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DomainRole } from "@/api/domain";

const PERMISSION_GROUP_LABELS: Record<string, string> = {
	domain: "域",
	room: "房间",
	message: "消息",
};

function groupPermissions(codes: string[]) {
	const groups = new Map<string, string[]>();
	for (const code of codes) {
		const prefix = code.split(":")[0] || "other";
		const list = groups.get(prefix) ?? [];
		list.push(code);
		groups.set(prefix, list);
	}
	return Array.from(groups, ([prefix, items]) => ({
		prefix,
		label: PERMISSION_GROUP_LABELS[prefix] ?? prefix,
		items,
	}));
}

export default function DomainRolePanel(props: {
	roles: DomainRole[];
	assignable: string[];
	loading: boolean;
	saving: boolean;
	error: string;
	onCreate: (name: string, permissions: string[]) => Promise<void>;
	onUpdate: (roleName: string, permissions: string[]) => Promise<void>;
	onDelete: (roleName: string) => Promise<void>;
}) {
	const [selected, setSelected] = useState("");
	const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
	const [newRoleName, setNewRoleName] = useState("");

	const selectRole = (role: DomainRole) => {
		setSelected(role.name);
		setSelectedCodes(new Set(role.permissions));
	};

	const toggle = (code: string, checked: boolean) => {
		const next = new Set(selectedCodes);
		if (checked) next.add(code);
		else next.delete(code);
		setSelectedCodes(next);
	};

	const isFixedRole = () => selected === "owner" || selected === "admin";

	const save = async () => {
		if (!selected) return;
		await props.onUpdate(selected, Array.from(selectedCodes));
	};

	const btnSm =
		"inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50";

	return (
		<div className="min-w-0">
			{props.error && (
				<div
					role="alert"
					className="border-destructive/50 bg-destructive/10 text-destructive mb-3 flex items-center rounded-sm px-3 py-2 text-sm"
				>
					<span>{props.error}</span>
				</div>
			)}
			<div className="grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
				<div className="flex flex-col gap-1">
					{props.loading && props.roles.length === 0 && (
						<div className="text-muted-foreground px-3 py-2 text-sm">
							正在加载角色…
						</div>
					)}
					{!props.loading && props.roles.length === 0 && (
						<div className="text-faint-foreground px-3 py-2 text-sm">
							暂无自定义角色
						</div>
					)}
					{props.roles.map((role) => (
						<button
							key={role.name}
							type="button"
							className={`flex cursor-pointer items-center justify-start gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors ${selected === role.name ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
							onClick={() => selectRole(role)}
						>
							<span className="truncate">{role.name}</span>
							{role.is_system && (
								<span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-1.5 text-2xs">
									系统
								</span>
							)}
						</button>
					))}
					<div className="mt-3 flex gap-2">
						<input
							className="border-input bg-card text-foreground focus-visible:ring-ring placeholder:text-faint-foreground min-w-0 h-9 flex-1 rounded-sm border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
							placeholder="新角色名"
							value={newRoleName}
							onChange={(e) => setNewRoleName(e.currentTarget.value)}
						/>
						<button
							type="button"
							className={`bg-primary text-primary-foreground hover:opacity-90 ${btnSm}`}
							disabled={!newRoleName.trim() || props.saving}
							onClick={() => {
								void props.onCreate(
									newRoleName.trim(),
									Array.from(selectedCodes),
								);
								setNewRoleName("");
							}}
						>
							<Plus size={14} />
							创建
						</button>
					</div>
				</div>
				<div className="min-w-0">
					{!selected ? (
						<p className="text-faint-foreground text-sm">
							选择角色进行权限配置
						</p>
					) : (
						<>
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<h3 className="font-semibold">{selected}</h3>
								<div className="flex gap-2">
									{!props.roles.find((r) => r.name === selected)?.is_system && (
										<button
											type="button"
											className={`border-destructive/50 text-destructive hover:bg-destructive/10 ${btnSm}`}
											disabled={props.saving}
											onClick={() => void props.onDelete(selected)}
										>
											<Trash2 size={14} />
											删除
										</button>
									)}
									<button
										type="button"
										className={`bg-primary text-primary-foreground hover:opacity-90 ${btnSm}`}
										disabled={props.saving || isFixedRole()}
										onClick={() => void save()}
									>
										<Save size={14} />
										保存权限
									</button>
								</div>
							</div>
							<div className="flex flex-col gap-3">
								{groupPermissions(props.assignable).map((group) => (
									<div key={group.prefix}>
										<div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-xs font-semibold">
											<span className="bg-primary h-3 w-0.5 rounded-full" />
											{group.label}
											<span className="text-faint-foreground font-normal">
												{group.items.length} 项
											</span>
										</div>
										<div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
											{group.items.map((code) => {
												const checked = selectedCodes.has(code);
												return (
													<label
														key={code}
														className={clsx(
															"flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
															checked
																? "bg-primary/10 text-foreground"
																: "hover:bg-muted/60 text-muted-foreground",
															isFixedRole() && "cursor-not-allowed",
														)}
													>
														<Checkbox
															checked={checked}
															disabled={isFixedRole()}
															onCheckedChange={(next) =>
																toggle(code, next === true)
															}
														/>
														<span className="min-w-0 truncate font-mono text-xs">
															{code}
														</span>
													</label>
												);
											})}
										</div>
									</div>
								))}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
