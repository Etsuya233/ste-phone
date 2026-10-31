import type { DiaryData } from "../diary.ts";

/** Storage must reject a write when chatId no longer identifies the active chat. */
export interface DiaryStorage {
  read(chatId: string): DiaryData | null;
  write(chatId: string, data: DiaryData): Promise<void>;
}
