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

/** 每个阶段只携带该阶段需要的数据，正文和条目各有唯一来源。 */
export type DiaryGeneration =
  | { readonly status: "idle" }
  | { readonly status: "reading" }
  | { readonly status: "generating"; readonly text: string }
  | { readonly status: "saving"; readonly entry: DiaryEntry }
  | { readonly status: "complete"; readonly entry: DiaryEntry }
  | { readonly status: "error"; readonly error: Error }
  | { readonly status: "save-error"; readonly entry: DiaryEntry; readonly error: Error };

export interface DiarySnapshot {
  readonly chatId: string | null;
  readonly data: DiaryData;
  readonly authors: readonly DiaryAuthor[];
  readonly worldTime: string | null;
  readonly preparing: boolean;
  readonly preparationError: Error | null;
  readonly generation: DiaryGeneration;
  readonly notice: string | null;
}

export function isDiaryRunning(generation: DiaryGeneration): boolean {
  return (
    generation.status === "reading" ||
    generation.status === "generating" ||
    generation.status === "saving"
  );
}

export function createDiaryEntry(author: DiaryAuthor, worldTime: string, body: string): DiaryEntry {
  const id = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    id,
    author: {
      id: author.id,
      name: author.name,
      sourceId: author.sourceId,
      scopeId: author.scopeId,
    },
    worldTime,
    body,
    createdAt: new Date().toISOString(),
  };
}
