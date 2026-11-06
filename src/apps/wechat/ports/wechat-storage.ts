import type { WechatData } from "../wechat.ts";

export interface WechatStorage {
  read(chatId: string): WechatData | null;
  /** 写入发出前可检查取消信号，发出后等待原目标确认。 */
  write(chatId: string, data: WechatData, signal?: AbortSignal): Promise<void>;
}
