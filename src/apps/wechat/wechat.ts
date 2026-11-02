import type { CharacterProfile } from "../data-source/public.ts";

export interface WechatPerson {
  readonly id: string;
  readonly scopeId: string;
  readonly name: string;
}
export interface TextContent {
  readonly type: "text";
  readonly text: string;
}
export interface WechatMessage {
  readonly id: string;
  readonly senderId: string;
  readonly content: TextContent;
  readonly createdAt: string;
  readonly reply?: { readonly batchId: string; readonly triggerMessageId: string };
}
export interface WechatConversation {
  readonly id: string;
  readonly people: readonly [WechatPerson, WechatPerson];
  readonly messages: readonly WechatMessage[];
}
export interface WechatData {
  readonly version: 1;
  readonly account: WechatPerson | null;
  readonly conversations: readonly WechatConversation[];
}
export type ReplyState =
  | { readonly status: "idle" }
  | { readonly status: "running"; readonly conversationId: string }
  | {
      readonly status: "error";
      readonly conversationId: string;
      readonly error: string;
      readonly retry: boolean;
    };
export interface WechatSnapshot {
  readonly chatId: string | null;
  readonly data: WechatData;
  readonly people: readonly CharacterProfile[];
  readonly scopeId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reply: ReplyState;
}
export const emptyWechat = (): WechatData => ({ version: 1, account: null, conversations: [] });
export const conversationId = (scopeId: string, a: string, b: string) =>
  JSON.stringify([scopeId, ...[a, b].sort()]);

export function createWechatMessage(senderId: string, content: TextContent): WechatMessage {
  return {
    id: [...crypto.getRandomValues(new Uint8Array(16))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(""),
    senderId,
    content,
    createdAt: new Date().toISOString(),
  };
}
