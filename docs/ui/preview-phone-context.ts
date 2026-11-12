import type { PhoneContextStorage } from "../../src/apps/phone-context/ports/context-storage.ts";
import { validateContextData } from "../../src/apps/phone-context/context-validation.ts";
import type { WechatData, WechatPerson } from "../../src/apps/wechat/wechat.ts";
import { conversationId } from "../../src/apps/wechat/wechat.ts";

export function createPreviewPhoneContextStorage(mode: string | null): PhoneContextStorage {
  let failNext = mode === "save-error";
  return {
    read(chatId) {
      const value = localStorage.getItem(`ste-phone-preview-context:${chatId}`);
      if (value === null) {
        return null;
      }
      const data: unknown = JSON.parse(value);
      validateContextData(data);
      return data;
    },
    async write(chatId, data) {
      validateContextData(data);
      if (mode === "slow-save") {
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      }
      if (failNext) {
        failNext = false;
        throw new Error("模拟上下文预设保存失败，请重试");
      }
      localStorage.setItem(`ste-phone-preview-context:${chatId}`, JSON.stringify(data));
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
    version: 4,
    account: people[3]!,
    conversations: [
      [0, 1],
      [0, 2],
      [1, 2],
      [0, 3],
    ].map(([a, b], index) => ({
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
  };
  localStorage.setItem(key, JSON.stringify(data));
}
