import { readMapData, type MapStorage } from "../../apps/map/map.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

export function createStMapStorage(metadata: StChatMetadataStorage): MapStorage {
  return {
    read(chatId) {
      const data = metadata.read(chatId, "maps", "地图");
      return data === undefined ? null : readMapData(structuredClone(data));
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      const saved = readMapData(structuredClone(data));
      await metadata.write({
        chatId,
        key: "maps",
        label: "地图",
        update: () => saved,
        beforeSubmit: () => signal?.throwIfAborted(),
        updateDetached: true,
      });
    },
  };
}
