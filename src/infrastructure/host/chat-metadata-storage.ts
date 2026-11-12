import type { ChatContext } from "../../core/chat/public.ts";
import type { StChatContext } from "./chat-context.ts";

export interface StChatSaveContext extends StChatContext {
  readonly characters: readonly { avatar: string; name: string }[];
  readonly chat: readonly unknown[];
  readonly chatMetadata: Record<string, unknown>;
  getRequestHeaders(): Record<string, string>;
}

interface MetadataWrite {
  readonly chatId: string;
  readonly key: string;
  readonly label: string;
  readonly update: (previous: unknown) => unknown;
  readonly beforeSubmit?: () => void;
  readonly updateDetached?: boolean;
}

export function createStChatMetadataStorage(
  getContext: () => StChatSaveContext,
  chat: ChatContext,
  request: typeof fetch = fetch,
) {
  const pending = new Map<string, Promise<void>>();

  function current(chatId: string, label: string): StChatSaveContext {
    if (chat.getSnapshot()?.id !== chatId) {
      throw new Error(`当前聊天已变化，无法读取或保存${label}`);
    }
    return getContext();
  }

  async function submit(write: MetadataWrite): Promise<void> {
    write.beforeSubmit?.();
    const context = current(write.chatId, write.label);
    const target = context.chatMetadata;
    const updatePhone = (metadata: Record<string, unknown>) => {
      const phone = metadata.ste_phone as Record<string, unknown> | undefined;
      return { ...phone, [write.key]: write.update(phone?.[write.key]) };
    };
    const savedPhone = updatePhone(target);
    const messages = [
      {
        chat_metadata: { ...target, ste_phone: savedPhone },
        user_name: "unused",
        character_name: "unused",
      },
      ...context.chat,
    ];
    const group = context.groupId != null;
    const character = group ? null : context.characters[Number(context.characterId)];
    if (!group && !character) {
      throw new Error(`${write.label}所属聊天缺少角色资料`);
    }
    const body = JSON.stringify(
      character
        ? {
            ch_name: character.name,
            file_name: context.chatId,
            avatar_url: character.avatar,
            chat: messages,
            force: false,
          }
        : { id: context.chatId, chat: messages, force: false },
    );
    // 请求发出后由原聊天接收结果，切换聊天不能取消已提交的保存。
    const response = await request(group ? "/api/chats/group/save" : "/api/chats/save", {
      method: "POST",
      headers: context.getRequestHeaders(),
      body,
    });
    if (!response.ok) {
      throw new Error(`${write.label}保存失败（HTTP ${response.status}）`);
    }
    const live = chat.getSnapshot()?.id === write.chatId ? getContext().chatMetadata : null;
    if (live) {
      live.ste_phone = updatePhone(live);
    }
    if (write.updateDetached && target !== live) {
      target.ste_phone = updatePhone(target);
    }
  }

  return {
    read(chatId: string, key: string, label: string): unknown {
      const phone = current(chatId, label).chatMetadata.ste_phone as
        Record<string, unknown> | undefined;
      return phone?.[key];
    },
    write(write: MetadataWrite): Promise<void> {
      const previous = pending.get(write.chatId);
      // ST 保存完整聊天头。前一个请求确认后才读取最新头，保留其他 App 已提交的字段。
      const saving = previous ? previous.then(() => submit(write)) : submit(write);
      const release = () => {
        if (pending.get(write.chatId) === tail) {
          pending.delete(write.chatId);
        }
      };
      const tail = saving.then(release, release);
      pending.set(write.chatId, tail);
      return saving;
    },
  };
}

export type StChatMetadataStorage = ReturnType<typeof createStChatMetadataStorage>;
