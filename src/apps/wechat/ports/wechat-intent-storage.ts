import type { WechatIntentData } from "../wechat-intent.ts";

export interface WechatIntentStorage {
  read(chatId: string): WechatIntentData | null;
  write(chatId: string, data: WechatIntentData): Promise<void>;
}
