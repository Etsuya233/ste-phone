import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic, CharacterProfile } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import { generateWechatReply } from "./wechat-generation.ts";
import { readWechatPrompt } from "./wechat-context.ts";
import { createWechatMessage, type WechatConversation, type WechatMessage } from "./wechat.ts";
import { wechatStickerCatalog, type WechatStickerPack } from "./wechat-stickers.ts";

/** 取材与连接属于本轮调用，完成后返回整批人物消息；持久化由微信服务负责。 */
export async function createWechatReplies(input: {
  data: DataAppPublic;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  sender: CharacterProfile;
  recipient: CharacterProfile;
  conversation: WechatConversation;
  signal: AbortSignal;
  stickerPacks: readonly WechatStickerPack[];
}): Promise<WechatMessage[]> {
  const { data, connections, transport, sender, recipient, conversation, signal } = input;
  const connectionId = connections.getSnapshot().defaultModelConnectionId;
  if (!connectionId) {
    throw new Error("请先在设置中选择默认模型连接");
  }
  const connection = connections.getConnection(connectionId);
  // 在本轮开始时固定可用表情；期间切换开关只影响展示与下一轮生成。
  const stickers = wechatStickerCatalog(input.stickerPacks);
  const prompt = await readWechatPrompt(
    data,
    { ...data.getSnapshot().context },
    sender,
    recipient,
    conversation,
    stickers,
  );
  signal.throwIfAborted();
  const contents = await generateWechatReply({ transport, connection, prompt, signal, stickers });
  const messages = contents.map((content) => createWechatMessage(recipient.id, content));
  const batchId = messages[0]!.id;
  return messages.map((message) => ({
    ...message,
    reply: { batchId, triggerMessageId: conversation.messages.at(-1)!.id },
  }));
}
