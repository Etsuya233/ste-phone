import type { WechatData } from "../../apps/wechat/wechat.ts";
import type { WechatStorage } from "../../apps/wechat/ports/wechat-storage.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { StChatContext } from "./chat-context.ts";
import { readWechatData, validateWechatData } from "../../apps/wechat/wechat-migrations.ts";

export interface StWechatContext extends StChatContext {
  readonly characters: readonly { avatar: string; name: string }[];
  readonly chat: readonly unknown[];
  readonly chatMetadata: Record<string, unknown>;
  getRequestHeaders(): Record<string, string>;
}

/** Capture the target and serialized chat before any await; ST's deferred save uses the active chat. */
export function createStWechatStorage(
  getContext: () => StWechatContext,
  chat: ChatContext,
  request: typeof fetch = fetch,
): WechatStorage {
  const current = (chatId: string) => {
    if (chat.getSnapshot()?.id !== chatId) {
      throw new Error("当前聊天已变化，无法保存微信");
    }
    return getContext();
  };
  let latestWrite = 0;
  return {
    read(chatId) {
      const context = current(chatId);
      const phone = context.chatMetadata.ste_phone as { wechat?: unknown } | undefined;
      if (phone?.wechat === undefined) {
        return null;
      }
      return readWechatData(phone.wechat);
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      validateWechatData(data);
      const context = current(chatId);
      const sequence = ++latestWrite;
      const save = captureWechatSave(context, data);
      const send = async (body: string) => {
        const response = await request(save.endpoint, {
          method: "POST",
          headers: save.headers,
          body,
        });
        if (!response.ok) {
          throw new Error(`微信保存失败（${response.status}）`);
        }
      };
      // 保存请求一旦发出就等待结果；取消 HTTP 无法证明服务端没有写入。
      await send(save.body);
      if (signal?.aborted) {
        try {
          await send(save.rollbackBody);
        } catch (error) {
          throw new Error(`取消回复后撤回保存失败：${(error as Error).message}`, { cause: error });
        }
        signal.throwIfAborted();
      }
      // 先确认持久化再发布元数据，失败与取消都不会留下本地半提交内容。
      if (chat.getSnapshot()?.id === chatId && sequence === latestWrite) {
        // 同一目标可能已重新载入新的 metadata 对象；只同步确认的微信字段，保留当前其他插件数据。
        const metadata = getContext().chatMetadata;
        const phone = metadata.ste_phone as Record<string, unknown> | undefined;
        metadata.ste_phone = { ...phone, wechat: structuredClone(data) };
      }
    },
  };
}

/** 请求与撤回使用同一个已固定目标，切换聊天后仍能完成原任务的清理。 */
function captureWechatSave(context: StWechatContext, data: WechatData) {
  const phone = context.chatMetadata.ste_phone as Record<string, unknown> | undefined;
  const header = {
    chat_metadata: context.chatMetadata,
    user_name: "unused",
    character_name: "unused",
  };
  const messages = [header, ...context.chat];
  const group = context.groupId != null;
  const character = group ? null : context.characters[Number(context.characterId)]!;
  const payload = group
    ? { id: context.chatId, chat: messages, force: false }
    : {
        ch_name: character!.name,
        file_name: context.chatId,
        avatar_url: character!.avatar,
        chat: messages,
        force: false,
      };
  const rollbackBody = JSON.stringify(payload);
  const nextHeader = {
    ...header,
    chat_metadata: { ...context.chatMetadata, ste_phone: { ...phone, wechat: data } },
  };
  return {
    endpoint: group ? "/api/chats/group/save" : "/api/chats/save",
    headers: context.getRequestHeaders(),
    body: JSON.stringify({ ...payload, chat: [nextHeader, ...context.chat] }),
    rollbackBody,
  };
}
