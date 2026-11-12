import type { ChatContext, PhoneChat } from "../../core/chat/public.ts";

/** Public ST getContext fields, verified against ST st-context.js and events.js. */
export interface StChatContext {
  chatId?: string;
  characterId?: string | number;
  groupId?: string | number | null;
  characters: readonly { avatar: string }[];
  eventSource: {
    on(event: string, listener: () => void): void;
    removeListener(event: string, listener: () => void): void;
  };
  eventTypes: {
    CHAT_CHANGED: string;
    CHAT_RENAMED: string;
    CHARACTER_RENAMED: string;
    GROUP_UPDATED: string;
  };
}

/** File identity: renaming, copying or branching a chat changes its id. Character array reordering does not. */
export function createStChatContext(
  getContext: () => StChatContext,
): ChatContext & { matchesMemoryChat(identity: string | null): boolean; dispose(): void } {
  const listeners = new Set<() => void>();
  let snapshot: PhoneChat | null = null;
  let memoryIdentity: string | null = null;
  const refresh = () => {
    const context = getContext();
    let next: PhoneChat | null = null;
    if (context.chatId) {
      const owner =
        context.groupId != null
          ? ["group", String(context.groupId)]
          : context.characterId !== undefined
            ? ["character", context.characters[Number(context.characterId)]!.avatar]
            : null;
      if (owner) {
        next = Object.freeze({
          id: JSON.stringify([...owner, context.chatId]),
          name: context.chatId,
        });
      }
    }
    // Memory 的公开聊天键使用角色索引。与 Phone 的文件身份一起取样，防止两边通知顺序不同。
    memoryIdentity = next
      ? context.groupId != null
        ? `group:${context.groupId}:${next.name}`
        : `char:${context.characterId}:${next.name}`
      : null;
    if (snapshot?.id === next?.id && snapshot?.name === next?.name) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  };
  const { eventSource, eventTypes } = getContext();
  const events = [
    eventTypes.CHAT_CHANGED,
    eventTypes.CHAT_RENAMED,
    eventTypes.CHARACTER_RENAMED,
    eventTypes.GROUP_UPDATED,
  ];
  refresh();
  for (const event of events) {
    eventSource.on(event, refresh);
  }
  return {
    getSnapshot: () => snapshot,
    matchesMemoryChat: (identity) => identity === memoryIdentity,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      for (const event of events) {
        eventSource.removeListener(event, refresh);
      }
      listeners.clear();
    },
  };
}
