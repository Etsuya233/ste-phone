import type { WechatData } from "../wechat.ts";

export interface WechatStorage {
  read(chatId: string): WechatData | null;
  /** 取消发生在保存期间时，撤回本次数据并等待撤回确认；失败必须暴露。 */
  write(chatId: string, data: WechatData, signal?: AbortSignal): Promise<void>;
}
