import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic, CharacterProfile, DataScope } from "../data-source/public.ts";
import type { ModelConnectionSnapshot, ModelConnectionsReader } from "../settings/public.ts";
import { generateWechatReply } from "./wechat-generation.ts";
import { readWechatPrompt } from "./wechat-context.ts";
import {
  createWechatMessage,
  pendingWechatMessages,
  type WechatConversation,
  type WechatGroupConversation,
  type WechatMessage,
} from "./wechat.ts";
import { selectWechatMemory } from "./wechat-memory.ts";
import { applyWechatPaymentAction } from "./wechat-message-content.ts";
import {
  parseWechatGroupReply,
  parseWechatReply,
  type WechatReplyOutput,
} from "./wechat-reply-output.ts";
import { wechatSystemPrompt } from "./wechat-prompt.ts";
import { readWechatGroupPrompt, wechatGroupSystemPrompt } from "./wechat-group-prompt.ts";
import { wechatStickerCatalog, type WechatStickerPack } from "./wechat-stickers.ts";

type Speakers =
  | { kind: "direct"; recipient: CharacterProfile; guidance: string }
  | {
      kind: "group";
      people: readonly CharacterProfile[];
      guidance: Readonly<Record<string, string>>;
      roundGuidance: string;
      requireAll: boolean;
    };

export interface WechatReplyInput {
  conversation: WechatConversation;
  sender: CharacterProfile;
  speakers: Speakers;
  historyMessageLimit: number;
}

/** 以本轮固定材料生成下一份会话；卡片操作、回复消息和队列完成边界一起交付保存。 */
export async function generateRepliedWechatConversation(
  input: {
    data: DataAppPublic;
    connections: ModelConnectionsReader;
    transport: AiTransport;
    signal: AbortSignal;
    stickerPacks: readonly WechatStickerPack[];
  } & WechatReplyInput,
): Promise<WechatConversation> {
  const { data, connections, transport, sender, speakers, conversation, signal } = input;
  const connectionId = connections.getSnapshot().defaultModelConnectionId;
  if (!connectionId) {
    throw new Error("请先在设置中选择默认模型连接");
  }
  const connection = connections.getConnection(connectionId);
  // 在本轮开始时固定可用表情；期间切换开关只影响展示与下一轮生成。
  const stickers = wechatStickerCatalog(input.stickerPacks);
  const scope = { ...data.getSnapshot().context };
  const memory = selectWechatMemory(conversation, sender.id, input.historyMessageLimit);
  if (conversation.kind === "group" && speakers.kind === "group") {
    return generateGroupReply({
      data,
      scope,
      sender,
      speakers,
      conversation,
      memory,
      stickers,
      transport,
      connection,
      signal,
    });
  }
  if (speakers.kind !== "direct" || conversation.kind === "group") {
    throw new Error("微信会话与回复人物类型不匹配");
  }
  const { recipient, guidance } = speakers;
  const prompt = await readWechatPrompt(
    data,
    scope,
    sender,
    recipient,
    conversation,
    input.historyMessageLimit,
    stickers,
  );
  signal.throwIfAborted();
  const systemPrompt = guidance
    ? `${wechatSystemPrompt}\n\n用户为当前回复人物设置的「回复指导」（JSON 字符串）：\n${JSON.stringify(guidance)}\n在表达方式、话题选择和性格表现上优先遵循该指导。指导不改变剧情事实、人物知情范围、现实时间规则、回复人物身份、JSON 输出格式或可用表情限制；不将指导作为微信消息复述。`
    : wechatSystemPrompt;
  const text = await generateWechatReply({ transport, connection, prompt, signal, systemPrompt });
  return applyWechatReply(
    conversation,
    sender.id,
    recipient.id,
    memory,
    parseWechatReply(text, stickers),
  );
}

async function generateGroupReply(input: {
  data: DataAppPublic;
  scope: DataScope;
  sender: CharacterProfile;
  speakers: Extract<Speakers, { kind: "group" }>;
  conversation: WechatGroupConversation;
  memory: ReturnType<typeof selectWechatMemory>;
  stickers: ReturnType<typeof wechatStickerCatalog>;
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  signal: AbortSignal;
}): Promise<WechatConversation> {
  const {
    data,
    scope,
    sender,
    speakers,
    conversation,
    memory,
    stickers,
    transport,
    connection,
    signal,
  } = input;
  const { prompt, systemGuidance } = await readWechatGroupPrompt({
    data,
    scope,
    sender,
    speakers: speakers.people,
    conversation,
    memory,
    stickers,
    guidance: speakers.guidance,
    roundGuidance: speakers.roundGuidance,
    requireAll: speakers.requireAll,
  });
  signal.throwIfAborted();
  const text = await generateWechatReply({
    transport,
    connection,
    prompt,
    signal,
    systemPrompt: wechatGroupSystemPrompt + systemGuidance,
  });
  const replies = parseWechatGroupReply(
    text,
    speakers.people.map(({ id }) => id),
    speakers.requireAll,
    stickers,
  ).map(({ senderId, content }) => createWechatMessage(senderId, content));
  return completeWechatReply(conversation, sender.id, memory.pending, replies);
}

function applyWechatReply(
  conversation: WechatConversation,
  senderId: string,
  recipientId: string,
  { eligible, pending, windowStart }: ReturnType<typeof selectWechatMemory>,
  { messages, paymentActions }: WechatReplyOutput,
) {
  // 与提示词使用同一读取范围，猜中的 ID 也不能越过记忆屏障或历史窗口。
  const visibleIds = new Set(eligible.slice(windowStart).map(({ id }) => id));
  let next = conversation;
  for (const { messageId, action } of paymentActions) {
    if (!visibleIds.has(messageId)) {
      throw new Error("微信回复引用了本轮未提供的卡片");
    }
    next = applyWechatPaymentAction(next, recipientId, messageId, action);
  }
  return completeWechatReply(
    next,
    senderId,
    pending,
    messages.map((content) => createWechatMessage(recipientId, content)),
  );
}

function completeWechatReply(
  conversation: WechatConversation,
  senderId: string,
  pending: readonly WechatMessage[],
  replies: readonly WechatMessage[],
): WechatConversation {
  const batchId = replies[0]?.id;
  const triggerMessageId = pending.at(-1)?.id;
  const appended = batchId
    ? replies.map((message) => ({
        ...message,
        reply: triggerMessageId ? { batchId, triggerMessageId } : { batchId },
      }))
    : [];
  // 即使本轮只操作卡片，也已处理完本轮队列（包含屏障明确跳过的旧消息）。
  const completed = pendingWechatMessages(conversation, senderId, true).at(-1)?.id;
  const pendingCompletedThrough = completed
    ? { ...conversation.pendingCompletedThrough, [senderId]: completed }
    : conversation.pendingCompletedThrough;
  const pendingReplies = { ...conversation.pendingReplies };
  delete pendingReplies[senderId];
  return {
    ...conversation,
    messages: [...conversation.messages, ...appended],
    pendingReplies,
    pendingCompletedThrough,
  };
}
