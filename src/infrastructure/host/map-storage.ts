import { readMapData, type MapData, type MapStorage } from "../../apps/map/map.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { StChatContext } from "./chat-context.ts";

export interface StMapContext extends StChatContext {
  readonly characters: readonly { avatar: string; name: string }[];
  readonly chat: readonly unknown[];
  readonly chatMetadata: Record<string, unknown>;
  getRequestHeaders(): Record<string, string>;
}

/** Capture the target and serialized chat before any await; ST's deferred save uses the active chat. */
export function createStMapStorage(
  getContext: () => StMapContext,
  chat: ChatContext,
  request: typeof fetch = fetch,
): MapStorage {
  const current = (chatId: string) => {
    if (chat.getSnapshot()?.id !== chatId) {
      throw new Error("当前聊天已变化，无法保存地图");
    }
    return getContext();
  };
  return {
    read(chatId) {
      const context = current(chatId);
      const phone = context.chatMetadata.ste_phone as { maps?: MapData } | undefined;
      if (phone?.maps === undefined) {
        return null;
      }
      return readMapData(structuredClone(phone.maps));
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      const context = current(chatId);
      const targetMetadata = context.chatMetadata;
      const phone = targetMetadata.ste_phone as Record<string, unknown> | undefined;
      const savedMaps = readMapData(structuredClone(data));
      const metadata = { ...targetMetadata, ste_phone: { ...phone, maps: savedMaps } };
      const header = {
        chat_metadata: metadata,
        user_name: "unused",
        character_name: "unused",
      };
      const messages = [header, ...context.chat];
      const group = context.groupId != null;
      const character = group ? null : context.characters[Number(context.characterId)]!;
      const body = JSON.stringify(
        group
          ? { id: context.chatId, chat: messages, force: false }
          : {
              ch_name: character!.name,
              file_name: context.chatId,
              avatar_url: character!.avatar,
              chat: messages,
              force: false,
            },
      );
      // Use the same ST save endpoints, retaining its integrity check and observable HTTP failures.
      const response = await request(group ? "/api/chats/group/save" : "/api/chats/save", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body,
      });
      if (!response.ok) {
        throw new Error(`地图保存失败（${response.status}）`);
      }
      targetMetadata.ste_phone = {
        ...(targetMetadata.ste_phone as Record<string, unknown> | undefined),
        maps: savedMaps,
      };
      // ST 切出再切回会替换元数据对象；确认后同步当前同一聊天的 maps，保留其余最新字段。
      if (chat.getSnapshot()?.id === chatId) {
        const currentMetadata = getContext().chatMetadata;
        currentMetadata.ste_phone = {
          ...(currentMetadata.ste_phone as Record<string, unknown> | undefined),
          maps: savedMaps,
        };
      }
    },
  };
}
