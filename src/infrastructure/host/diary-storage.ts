import type { DiaryData } from "../../apps/diary/diary.ts";
import type { DiaryStorage } from "../../apps/diary/ports/diary-storage.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { StChatContext } from "./chat-context.ts";

export interface StDiaryContext extends StChatContext {
  readonly characters: readonly { avatar: string; name: string }[];
  readonly chat: readonly unknown[];
  readonly chatMetadata: Record<string, unknown>;
  getRequestHeaders(): Record<string, string>;
}

/** Capture the target and serialized chat before any await; ST's deferred save uses the active chat. */
export function createStDiaryStorage(
  getContext: () => StDiaryContext,
  chat: ChatContext,
  request: typeof fetch = fetch,
): DiaryStorage {
  const current = (chatId: string) => {
    if (chat.getSnapshot()?.id !== chatId) {
      throw new Error("当前聊天已变化，无法保存日记");
    }
    return getContext();
  };
  return {
    read(chatId) {
      const context = current(chatId);
      const phone = context.chatMetadata.ste_phone as { diary?: DiaryData } | undefined;
      if (phone?.diary === undefined) {
        return null;
      }
      if (phone.diary.version !== 1) {
        throw new Error("日记数据版本不受支持");
      }
      return structuredClone(phone.diary);
    },
    async write(chatId, data) {
      const context = current(chatId);
      const phone = context.chatMetadata.ste_phone as Record<string, unknown> | undefined;
      context.chatMetadata.ste_phone = { ...phone, diary: structuredClone(data) };
      const header = {
        chat_metadata: context.chatMetadata,
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
        throw new Error(`日记保存失败（${response.status}）`);
      }
    },
  };
}
