import type { DomainMember } from "@/api/domain";
import type { MemberInfo } from "@/socket/types";

export interface RosterMember {
	identity: string;
	name: string;
	display_name: string;
	avatar: string;
	online: boolean;
	is_me: boolean;
	is_mic_muted: boolean;
	is_muted: boolean;
}

export interface MemberRoster {
	online: RosterMember[];
	offline: RosterMember[];
	total: number;
	loading: boolean;
}

export interface RosterInput {
	/** 域成员全量名单；无域（平台房）时为空，退回当前房间在线名单 */
	domainMembers: DomainMember[] | undefined;
	/** 当前房间信令在线成员 */
	liveMembers: MemberInfo[];
	/** 本域全部房间的在线身份（含其他房间） */
	onlineIdentities: string[];
	myName: string | undefined;
}

const putMeFirst = (list: RosterMember[]): RosterMember[] =>
	list.sort((a, b) => (a.is_me === b.is_me ? 0 : a.is_me ? -1 : 1));

/** 合并域成员名单与信令在线状态，按在线/离线分组 */
export function buildMemberRoster({
	domainMembers,
	liveMembers,
	onlineIdentities,
	myName,
}: RosterInput): MemberRoster {
	const liveByIdentity = new Map(liveMembers.map((m) => [m.identity, m]));
	const onlineSet = new Set(onlineIdentities);
	for (const m of liveMembers) onlineSet.add(m.identity);

	const seen = new Set<string>();
	const online: RosterMember[] = [];
	const offline: RosterMember[] = [];

	const push = (member: RosterMember) => {
		if (!member.identity || seen.has(member.identity)) return;
		seen.add(member.identity);
		(member.online ? online : offline).push(member);
	};

	for (const dm of domainMembers ?? []) {
		if (!dm.name) continue;
		const live = liveByIdentity.get(dm.name);
		push({
			identity: dm.name,
			name: dm.name,
			display_name: dm.nickname || dm.display_name || dm.name,
			avatar: live?.avatar || dm.avatar || "",
			online: onlineSet.has(dm.name),
			is_me: dm.name === myName,
			is_mic_muted: !!live?.is_mic_muted,
			is_muted: !!live?.is_muted,
		});
	}

	for (const m of liveMembers) {
		push({
			identity: m.identity,
			name: m.name,
			display_name: m.display_name || m.name || m.identity,
			avatar: m.avatar ?? "",
			online: true,
			is_me: m.identity === myName,
			is_mic_muted: !!m.is_mic_muted,
			is_muted: !!m.is_muted,
		});
	}

	return {
		online: putMeFirst(online),
		offline: putMeFirst(offline),
		total: online.length + offline.length,
		loading: false,
	};
}
