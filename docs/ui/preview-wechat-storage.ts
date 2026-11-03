import type { WechatData } from "../../src/apps/wechat/wechat.ts";
import type { WechatStorage } from "../../src/apps/wechat/ports/wechat-storage.ts";
import { validateWechatMoments } from "../../src/apps/wechat/wechat-moments-storage.ts";
import { previewWechatMoments } from "./preview-wechat-moments.ts";

/** 预览消息独立保存，刷新仍可回看，绝不接触宿主聊天。 */
export function createPreviewWechatStorage(
  mode: string | null,
  momentsMode?: string | null,
): WechatStorage {
  return {
    read(chatId) {
      const text = localStorage.getItem(`ste-phone-preview-wechat:${chatId}`);
      if (!text) {
        return momentsMode === "demo" ? previewWechatMoments() : null;
      }
      const data = JSON.parse(text) as WechatData;
      if (data.version !== 1) {
        throw new Error("预览微信数据版本不受支持");
      }
      validateWechatMoments(data.moments);
      return data;
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      validateWechatMoments(data.moments);
      if (mode === "save-error" || momentsMode === "save-error") {
        throw new Error("模拟微信保存失败");
      }
      localStorage.setItem(`ste-phone-preview-wechat:${chatId}`, JSON.stringify(data));
    },
  };
}
