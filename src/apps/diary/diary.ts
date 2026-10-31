export interface DiarySettings {
  readonly timeoutSeconds: number;
  readonly maxTokens: number;
}

export interface DiaryAuthor {
  readonly id: string;
  readonly name: string;
  readonly profileText: string;
  readonly sourceId: string;
  readonly scopeId: string;
}

export interface DiaryEntry {
  readonly id: string;
  readonly author: Omit<DiaryAuthor, "profileText">;
  readonly worldTime: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface DiaryData {
  readonly version: 1;
  readonly author: DiaryAuthor | null;
  readonly settings: DiarySettings;
  readonly entries: readonly DiaryEntry[];
}

export function createEmptyDiary(): DiaryData {
  return {
    version: 1,
    author: null,
    settings: { timeoutSeconds: 300, maxTokens: 10240 },
    entries: [],
  };
}

export interface DiarySnapshot {
  readonly chatId: string | null;
  readonly data: DiaryData;
  readonly authors: readonly DiaryAuthor[];
  readonly worldTime: string | null;
  readonly status: "idle" | "loading" | "generating" | "saving" | "complete" | "error";
  readonly text: string;
  readonly error: string | null;
  readonly notice: string | null;
  readonly result: DiaryEntry | null;
  readonly unsaved: DiaryEntry | null;
}
