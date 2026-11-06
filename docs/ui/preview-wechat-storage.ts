import type { WechatStorage } from "../../src/apps/wechat/ports/wechat-storage.ts";
import { readWechatData, validateWechatData } from "../../src/apps/wechat/wechat-migrations.ts";
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
      return readWechatData(JSON.parse(text));
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      validateWechatData(data);
      if (
        momentsMode === "image-save-error" &&
        Object.values(data.moments ?? {}).some((moments) =>
          moments.some((moment) =>
            moment.media.some((item) => item.type === "image" && item.image),
          ),
        )
      ) {
        throw new Error("模拟朋友圈图片关联保存失败");
      }
      if (mode === "save-error" || momentsMode === "save-error") {
        throw new Error("模拟微信保存失败");
      }
      if (mode === "slow-save" || momentsMode === "slow-save") {
        await new Promise<void>((resolve) => setTimeout(resolve, 2500));
      }
      localStorage.setItem(`ste-phone-preview-wechat:${chatId}`, JSON.stringify(data));
    },
  };
}
