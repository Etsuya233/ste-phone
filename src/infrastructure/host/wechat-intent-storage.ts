import type { WechatIntentStorage } from "../../apps/wechat/ports/wechat-intent-storage.ts";
import { validateWechatIntentData } from "../../apps/wechat/public.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";
import { readPhoneIntentBlocks } from "./phone-intent-migration.ts";

/** Intent 独立于微信消息保存，避免消息全量写入覆盖配置；旧宏迁移在同一提交内完成。 */
export function createStWechatIntentStorage(metadata: StChatMetadataStorage): WechatIntentStorage {
  return {
    read(chatId) {
      return readPhoneIntentBlocks(
        metadata.read(chatId, "contextPresets", "ST 接入"),
        metadata.read(chatId, "wechatIntents", "微信 App Intent"),
      ).wechatIntents;
    },
    async write(chatId, data) {
      validateWechatIntentData(data);
      const saved = structuredClone(data);
      await metadata.write({
        chatId,
        label: "微信 App Intent",
        updateBlocks: (phone) => ({
          ...readPhoneIntentBlocks(phone.contextPresets, phone.wechatIntents),
          wechatIntents: saved,
        }),
      });
    },
  };
}
