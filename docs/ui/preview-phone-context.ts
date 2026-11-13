import type { PhoneContextStorage } from "../../src/apps/phone-context/ports/context-storage.ts";
import type { WechatIntentStorage } from "../../src/apps/wechat/ports/wechat-intent-storage.ts";
import { validateContextData } from "../../src/apps/phone-context/context-validation.ts";
import { validateWechatIntentData } from "../../src/apps/wechat/public.ts";
import {
  readPhoneIntentBlocks,
  type PhoneIntentBlocks,
} from "../../src/infrastructure/host/phone-intent-migration.ts";
import type {
  WechatData,
  WechatDirectConversation,
  WechatPerson,
} from "../../src/apps/wechat/wechat.ts";
import { conversationId } from "../../src/apps/wechat/wechat.ts";

/** 一个 localStorage 值原子保存绑定与 Intent；存在新结构后不再读取旧预设。 */
export function createPreviewIntentStores(mode: string | null): {
  context: PhoneContextStorage;
  intents: WechatIntentStorage;
} {
  let failNext = mode === "save-error";
  const prefix = "ste-phone-preview-intent-blocks:";
  function read(chatId: string): PhoneIntentBlocks {
    const text = localStorage.getItem(prefix + chatId);
    if (text !== null) {
      const saved = JSON.parse(text);
      if (!saved || saved.version !== 1 || !saved.blocks) {
        throw new Error("预览 App Intent 存储格式无效");
      }
      return readPhoneIntentBlocks(saved.blocks.contextPresets, saved.blocks.wechatIntents);
    }
    const legacy = localStorage.getItem(`ste-phone-preview-context:${chatId}`);
    return readPhoneIntentBlocks(legacy === null ? undefined : JSON.parse(legacy), undefined);
  }
  async function write(chatId: string, update: (blocks: PhoneIntentBlocks) => PhoneIntentBlocks) {
    if (mode === "slow-save") {
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    }
    if (failNext) {
      failNext = false;
      throw new Error("模拟 App Intent 配置保存失败，请重试");
    }
    const blocks = update(read(chatId));
    localStorage.setItem(prefix + chatId, JSON.stringify({ version: 1, blocks }));
  }
  return {
    context: {
      read: (chatId) => read(chatId).contextPresets,
      async write(chatId, data) {
        validateContextData(data);
        const saved = structuredClone(data);
        await write(chatId, (blocks) => ({ ...blocks, contextPresets: saved }));
      },
    },
    intents: {
      read: (chatId) => read(chatId).wechatIntents,
      async write(chatId, data) {
        validateWechatIntentData(data);
        const saved = structuredClone(data);
        await write(chatId, (blocks) => ({ ...blocks, wechatIntents: saved }));
      },
    },
  };
}

/** 显式验收入口才提供样例；写入一次，刷新后时间自然流逝，窗口不会被重新刷新。 */
export function seedPreviewContextWechat(): void {
  const key = "ste-phone-preview-wechat:preview-chat";
  if (localStorage.getItem(key) !== null) {
    return;
  }
  const people: WechatPerson[] = ["小红", "小蓝", "小绿", "小白"].map((name, index) => ({
    id: ["red", "blue", "green", "white"][index]!,
    name,
    scopeId: "preview-space",
  }));
  const now = Date.now();
  const data: WechatData = {
    version: 6,
    account: people[3]!,
    conversations: [
      ...[
        [0, 1],
        [0, 2],
        [1, 2],
        [0, 3],
      ].map(([a, b], index): WechatDirectConversation => ({
        id: conversationId("preview-space", people[a!]!.id, people[b!]!.id),
        people: [people[a!]!, people[b!]!],
        messages: [65, 25, 10, 5].map((minutes, message) => ({
          id: `context-${index}-${message}`,
          senderId: people[(message % 2 === 0 ? a : b)!]!.id,
          content: {
            type: "text",
            text: `${people[a!]!.name}与${people[b!]!.name}的消息 ${message + 1}`,
          },
          createdAt: new Date(now - minutes * 60_000).toISOString(),
          ...(message === 2 && index === 0 ? { recalled: true as const } : {}),
        })),
        ...(index === 1
          ? {
              memoryBarriers: [
                { id: "context-barrier", afterMessageId: `context-${index}-1`, enabled: true },
              ],
            }
          : {}),
      })),
      {
        id: "context-demo-group",
        kind: "group",
        name: "样例群聊",
        description: "用于预览 App Intent 群聊筛选。",
        people: [people[0]!, people[1]!, people[2]!, people[3]!],
        memberIds: ["red", "blue", "white"],
        messages: [
          {
            id: "context-demo-group-message",
            senderId: "green",
            content: { type: "text", text: "群聊的历史消息" },
            createdAt: new Date(now - 10 * 60_000).toISOString(),
          },
          {
            id: "context-demo-group-system",
            senderId: "red",
            content: { type: "system", text: "小红将小绿移出群聊" },
            createdAt: new Date(now - 5 * 60_000).toISOString(),
          },
        ],
      },
    ],
  };
  localStorage.setItem(key, JSON.stringify(data));
}
