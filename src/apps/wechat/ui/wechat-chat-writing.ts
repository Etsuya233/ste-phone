import { canReadWechatGroup } from "../wechat-group.ts";
import type { WechatSnapshot } from "../wechat.ts";

export function canWriteWechatChat(state: WechatSnapshot, otherId: string): boolean {
  const { account, conversations } = state.data;
  if (!account || state.loading || state.error || account.scopeId !== state.scopeId) {
    return false;
  }
  const group = conversations.find((item) => item.id === otherId && item.kind === "group");
  return group?.kind === "group"
    ? canReadWechatGroup(group, account)
    : state.people.some((person) => person.id === otherId);
}

export function wechatChatWriteBusy(state: WechatSnapshot): boolean {
  return (
    state.writeBusy ||
    state.chatMediaBusy ||
    state.barrierSaving ||
    state.reply.status === "running" ||
    state.reply.status === "sending" ||
    state.reply.status === "saving" ||
    state.momentGeneration.status === "running" ||
    state.momentGeneration.status === "saving"
  );
}
