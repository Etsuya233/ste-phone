import type { DiaryData } from "../../src/apps/diary/diary.ts";
import type { DiaryStorage } from "../../src/apps/diary/ports/diary-storage.ts";

/** Preview business data remains separate from ST, including refresh recovery. */
export function createPreviewDiaryStorage(mode: string | null): DiaryStorage {
  const key = (chatId: string) => `ste-phone-preview-diary:${chatId}`;
  return {
    read(chatId) {
      const saved = localStorage.getItem(key(chatId));
      if (saved === null) return null;
      const data = JSON.parse(saved) as DiaryData;
      if (data.version !== 1) throw new Error("日记数据版本不受支持");
      return data;
    },
    async write(chatId, data) {
      if (mode === "save-error") throw new Error("预览：日记保存失败");
      localStorage.setItem(key(chatId), JSON.stringify(data));
    },
  };
}
