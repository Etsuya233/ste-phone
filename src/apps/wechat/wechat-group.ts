import type { CharacterProfile } from "../data-source/public.ts";
import {
  createWechatMessage,
  pendingWechatMessages,
  type WechatGroupConversation,
  type WechatPerson,
  type WechatSnapshot,
} from "./wechat.ts";

export interface WechatGroupDetails {
  name: string;
  description: string;
  memberIds: readonly string[];
}

export type WechatGroupReply = {
  readonly memberIds?: readonly string[];
  readonly guidance?: string;
};

export function canReadWechatGroup(group: WechatGroupConversation, account: WechatPerson): boolean {
  return group.people[0].scopeId === account.scopeId && group.memberIds.includes(account.id);
}

export function changeWechatGroup(
  state: WechatSnapshot,
  details: WechatGroupDetails,
  group?: WechatGroupConversation,
): WechatGroupConversation {
  const {
    data: { account },
    people,
    scopeId,
    error,
    loading,
  } = state;
  if (
    !account ||
    account.scopeId !== scopeId ||
    loading ||
    error ||
    (group && !canReadWechatGroup(group, account))
  ) {
    throw new Error("当前帐号或群聊资料不可用");
  }
  const name = details.name.trim();
  const description = details.description.trim();
  const memberIds = [...new Set(details.memberIds)];
  if (!name || !memberIds.includes(account.id) || (!group && memberIds.length < 2)) {
    throw new Error("请填写群名并保留当前帐号，新建群聊至少需要两人");
  }
  const identities = new Map((group?.people ?? [account]).map((person) => [person.id, person]));
  const previous = new Set(group?.memberIds ?? []);
  const current = new Set(memberIds);
  const added = memberIds.filter((id) => !previous.has(id) && id !== account.id);
  const removed = [...previous].filter((id) => !current.has(id));
  for (const id of added) {
    const person = people.find((item) => item.id === id);
    if (!person) {
      throw new Error("只能添加当前资料空间中的人物");
    }
    identities.set(id, { id, name: person.name, scopeId });
  }
  const label = (id: string) =>
    people.find((person) => person.id === id)?.name ?? identities.get(id)!.name;
  const notices = [
    ...(!group ? [`${label(account.id)}创建了群聊`] : []),
    ...(added.length ? [`${label(account.id)}添加了${added.map(label).join("、")}`] : []),
    ...(removed.length ? [`${label(account.id)}移除了${removed.map(label).join("、")}`] : []),
  ].map((text) => createWechatMessage(account.id, { type: "system", text }));
  const closedQueues = group
    ? closeGroupQueues(group, memberIds.length === 1 ? [...removed, account.id] : removed)
    : {};
  return {
    ...group,
    ...closedQueues,
    kind: "group",
    // getRandomValues 在普通 HTTP 上也可用，群 ID 无需 UUID 格式。
    id:
      group?.id ??
      `group:${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")}`,
    people: [account, ...[...identities.values()].filter(({ id }) => id !== account.id)],
    name,
    description,
    memberIds,
    messages: [...(group?.messages ?? []), ...notices],
  };
}

/** 移出和转为单人群时关闭旧队列，历史保留但后续加人不会触发旧消息。 */
function closeGroupQueues(group: WechatGroupConversation, senderIds: readonly string[]) {
  const pendingReplies = { ...group.pendingReplies };
  const pendingCompletedThrough = { ...group.pendingCompletedThrough };
  for (const id of senderIds) {
    const last = pendingWechatMessages(group, id, true).at(-1);
    if (last) {
      pendingCompletedThrough[id] = last.id;
    }
    delete pendingReplies[id];
  }
  return { pendingReplies, pendingCompletedThrough };
}

export function selectWechatGroupSpeakers(
  group: WechatGroupConversation,
  accountId: string,
  people: readonly CharacterProfile[],
  round: WechatGroupReply,
): readonly CharacterProfile[] {
  const eligible = group.memberIds.filter((id) => id !== accountId);
  const selected = round.memberIds === undefined ? eligible : [...new Set(round.memberIds)];
  if (
    round.memberIds !== undefined &&
    (!selected.length || selected.some((id) => !eligible.includes(id)))
  ) {
    throw new Error("请选择本轮可以发言的其他群成员");
  }
  return selected.map((id) => {
    const person = people.find((item) => item.id === id);
    if (!person) {
      throw new Error("群成员资料不可用，请先更新群成员");
    }
    return person;
  });
}
