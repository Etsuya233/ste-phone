import type { WechatStorage } from "../../apps/wechat/ports/wechat-storage.ts";
import { readWechatData, validateWechatData } from "../../apps/wechat/wechat-migrations.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

export function createStWechatStorage(metadata: StChatMetadataStorage): WechatStorage {
  return {
    read(chatId) {
      const data = metadata.read(chatId, "wechat", "微信");
      return data === undefined ? null : readWechatData(data);
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      validateWechatData(data);
      const saved = structuredClone(data);
      await metadata.write({
        chatId,
        key: "wechat",
        label: "微信",
        update: () => saved,
        beforeSubmit: () => signal?.throwIfAborted(),
      });
    },
  };
}
