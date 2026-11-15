import { describe, expect, it } from "vitest";
import type { DomainMember } from "@/api/domain";
import type { MemberInfo } from "@/socket/types";
import { buildMemberRoster } from "./memberRoster";

const domainMember = (name: string, extra: Partial<DomainMember> = {}) =>
	({
		id: 1,
		domain_uuid: "d1",
		user_uuid: `uuid-${name}`,
		nickname: "",
		role_name: "member",
		joined_at: "",
		name,
		display_name: name.toUpperCase(),
		...extra,
	}) as DomainMember;

const liveMember = (
	identity: string,
	extra: Partial<MemberInfo> = {},
): MemberInfo =>
	({
		id: identity,
		identity,
		name: identity,
		display_name: identity.toUpperCase(),
		avatar: `avatar-${identity}`,
		is_muted: false,
		is_mic_muted: false,
		joined_at: 0,
		...extra,
	}) as MemberInfo;

describe("buildMemberRoster", () => {
	it("域成员全量展示，在线状态取自本域所有房间", () => {
		const roster = buildMemberRoster({
			domainMembers: [
				domainMember("alice"),
				domainMember("bob"),
				domainMember("carol"),
			],
			liveMembers: [liveMember("alice", { is_mic_muted: true })],
			onlineIdentities: ["alice", "bob"],
			myName: "carol",
		});

		expect(roster.online.map((m) => m.identity)).toEqual(["alice", "bob"]);
		expect(roster.offline.map((m) => m.identity)).toEqual(["carol"]);
		expect(roster.total).toBe(3);
		expect(roster.online[0]).toMatchObject({
			online: true,
			is_mic_muted: true,
			avatar: "avatar-alice",
		});
		expect(roster.offline[0]).toMatchObject({
			online: false,
			is_me: true,
			is_mic_muted: false,
			avatar: "",
		});
	});

	it("域昵称优先作为展示名", () => {
		const roster = buildMemberRoster({
			domainMembers: [domainMember("alice", { nickname: "爱丽丝" })],
			liveMembers: [],
			onlineIdentities: [],
			myName: "me",
		});

		expect(roster.offline[0].display_name).toBe("爱丽丝");
	});

	it("无域时退回当前房间在线成员", () => {
		const roster = buildMemberRoster({
			domainMembers: undefined,
			liveMembers: [liveMember("bob"), liveMember("me")],
			onlineIdentities: ["bob", "me"],
			myName: "me",
		});

		expect(roster.offline).toEqual([]);
		expect(roster.online.map((m) => m.identity)).toEqual(["me", "bob"]);
	});

	it("在线但不在成员名单中的信令成员补进在线组", () => {
		const roster = buildMemberRoster({
			domainMembers: [domainMember("alice")],
			liveMembers: [liveMember("guest")],
			onlineIdentities: ["guest"],
			myName: "alice",
		});

		expect(roster.online.map((m) => m.identity)).toEqual(["guest"]);
		expect(roster.offline.map((m) => m.identity)).toEqual(["alice"]);
	});

	it("同一身份不重复出现", () => {
		const roster = buildMemberRoster({
			domainMembers: [domainMember("alice")],
			liveMembers: [liveMember("alice")],
			onlineIdentities: ["alice"],
			myName: "alice",
		});

		expect(roster.total).toBe(1);
	});
});
