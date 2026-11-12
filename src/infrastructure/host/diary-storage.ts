import { readDiaryData, type DiaryData } from "../../apps/diary/diary.ts";
import type { DiaryStorage } from "../../apps/diary/ports/diary-storage.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

export function createStDiaryStorage(metadata: StChatMetadataStorage): DiaryStorage {
  return {
    read(chatId) {
      const data = metadata.read(chatId, "diary", "日记");
      return data === undefined ? null : readDiaryData(structuredClone(data as DiaryData));
    },
    async write(chatId, data) {
      const saved = readDiaryData(structuredClone(data));
      await metadata.write({
        chatId,
        key: "diary",
        label: "日记",
        update: () => saved,
        updateDetached: true,
      });
    },
  };
}
