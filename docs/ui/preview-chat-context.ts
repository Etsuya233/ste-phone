import type { ChatContext, PhoneChat } from "../../src/core/chat/public.ts";

/** 预览有自己的聊天身份，不依赖 Memory 示例的可用性。 */
export function createPreviewChatContext(): ChatContext {
  const snapshot: PhoneChat = Object.freeze({ id: "preview-chat", name: "预览聊天" });
  return { getSnapshot: () => snapshot, subscribe: () => () => {} };
}
