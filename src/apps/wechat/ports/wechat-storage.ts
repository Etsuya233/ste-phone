import type { WechatData } from "../wechat.ts";

export interface WechatStorage {
  read(chatId: string): WechatData | null;
  write(chatId: string, data: WechatData): Promise<void>;
}
