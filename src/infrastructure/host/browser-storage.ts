import { readBrowserData, type BrowserStorage } from "../../apps/browser/browser.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

export function createStBrowserStorage(metadata: StChatMetadataStorage): BrowserStorage {
  return {
    read(chatId) {
      const data = metadata.read(chatId, "browser", "浏览器");
      return data === undefined ? null : readBrowserData(structuredClone(data));
    },
    async write(chatId, data) {
      await metadata.write({
        chatId,
        key: "browser",
        label: "浏览器",
        update: () => data,
        updateDetached: true,
      });
    },
  };
}
