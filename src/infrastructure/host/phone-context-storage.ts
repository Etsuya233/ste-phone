import type { PhoneContextStorage } from "../../apps/phone-context/ports/context-storage.ts";
import { validateContextData } from "../../apps/phone-context/context-validation.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";
import { readPhoneIntentBlocks } from "./phone-intent-migration.ts";

/** 预设随 ST 聊天保存，与微信正文共用宿主的串行元数据写入队列。 */
export function createStPhoneContextStorage(metadata: StChatMetadataStorage): PhoneContextStorage {
  return {
    read(chatId) {
      return readPhoneIntentBlocks(
        metadata.read(chatId, "contextPresets", "ST 接入"),
        metadata.read(chatId, "wechatIntents", "微信 App Intent"),
      ).contextPresets;
    },
    async write(chatId, data) {
      validateContextData(data);
      const saved = structuredClone(data);
      await metadata.write({
        chatId,
        label: "ST 接入",
        updateBlocks: (phone) => ({
          ...readPhoneIntentBlocks(phone.contextPresets, phone.wechatIntents),
          contextPresets: saved,
        }),
      });
    },
  };
}
