import type { WechatSnapshot } from "../wechat.ts";

export function canWriteWechatChat(state: WechatSnapshot, otherId: string): boolean {
  return (
    !!state.data.account &&
    !state.loading &&
    !state.error &&
    state.people.some((person) => person.id === otherId)
  );
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
