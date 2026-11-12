import type { PhoneContextStorage } from "../../apps/phone-context/ports/context-storage.ts";
import { validateContextData } from "../../apps/phone-context/context-validation.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

/** 预设随 ST 聊天保存，与微信正文共用宿主的串行元数据写入队列。 */
export function createStPhoneContextStorage(metadata: StChatMetadataStorage): PhoneContextStorage {
  return {
    read(chatId) {
      const value = metadata.read(chatId, "contextPresets", "手机上下文预设");
      if (value === undefined) {
        return null;
      }
      validateContextData(value);
      return structuredClone(value);
    },
    async write(chatId, data) {
      validateContextData(data);
      const saved = structuredClone(data);
      await metadata.write({
        chatId,
        key: "contextPresets",
        label: "手机上下文预设",
        update: () => saved,
      });
    },
  };
}
