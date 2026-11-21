import clsx from "clsx";
import { Folder } from "lucide-react";
import { colorChip } from "@/utils/domainLayout";

interface DomainGroupIconProps {
	name: string;
	color: string;
	count: number;
	active?: boolean;
}

export default function DomainGroupIcon({
	name,
	color,
	count,
	active,
}: DomainGroupIconProps) {
	const label = `${name} · ${count} 个域`;
	return (
		<span
			title={label}
			role="img"
			aria-label={label}
			className={clsx(
				"relative flex size-12 shrink-0 items-center justify-center rounded-xl",
				colorChip(color),
				active && "shadow-sm",
			)}
		>
			<Folder size={24} />
			<span className="bg-neutral text-neutral-foreground absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-2xs">
				{count}
			</span>
			{active && (
				<span
					aria-hidden="true"
					className="bg-primary pointer-events-none absolute bottom-0.5 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full"
				/>
			)}
		</span>
	);
}
