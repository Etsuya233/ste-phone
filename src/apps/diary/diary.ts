import type { CharacterProfile } from "../data-source/public.ts";

export interface DiarySettings {
  readonly timeoutSeconds: number;
  readonly maxTokens: number;
  readonly autoGenerateImage?: boolean;
}

/** 持久作者：scopeId/id 保存稳定空间与人物身份；字段形状与历史日记一致。 */
export interface DiaryAuthor {
  readonly id: string;
  readonly name: string;
  readonly profileText: string;
  readonly avatar?: CharacterProfile["avatar"];
  readonly sourceId: string;
  readonly scopeId: string;
}

export interface DiaryEntry {
  readonly id: string;
  readonly author: Omit<DiaryAuthor, "profileText" | "avatar">;
  readonly worldTime: string;
  readonly body: string;
  readonly imagePrompt?: string;
  readonly image?: { readonly id: string; readonly imagePath: string };
  readonly createdAt: string;
}

export interface DiaryData {
  readonly version: 1;
  readonly author: Omit<DiaryAuthor, "avatar"> | null;
  readonly settings: DiarySettings;
  readonly entries: readonly DiaryEntry[];
}

export function createEmptyDiary(): DiaryData {
  return {
    version: 1,
    author: null,
    settings: { timeoutSeconds: 300, maxTokens: 10240, autoGenerateImage: false },
    entries: [],
  };
}

/** 每个阶段只携带该阶段需要的数据，正文和条目各有唯一来源。 */
export type DiaryGeneration =
  | { readonly status: "idle" }
  | { readonly status: "reading" }
  | { readonly status: "generating"; readonly thinking: boolean }
  | { readonly status: "saving"; readonly entry: DiaryEntry }
  | { readonly status: "complete"; readonly entry: DiaryEntry }
  | { readonly status: "error"; readonly error: Error }
  | { readonly status: "save-error"; readonly entry: DiaryEntry; readonly error: Error };

export type DiaryImageTask =
  | { readonly status: "idle" }
  | { readonly status: "generating" | "prompting" | "saving"; readonly entryId: string }
  | { readonly status: "error"; readonly entryId: string; readonly error: Error };

export interface DiarySnapshot {
  readonly chatId: string | null;
  readonly data: DiaryData;
  readonly authors: readonly DiaryAuthor[];
  readonly worldTime: string | null;
  readonly preparing: boolean;
  readonly preparationError: Error | null;
  readonly generation: DiaryGeneration;
  readonly imageTask: DiaryImageTask;
}

export function isDiaryRunning(generation: DiaryGeneration): boolean {
  return (
    generation.status === "reading" ||
    generation.status === "generating" ||
    generation.status === "saving"
  );
}

export function isDiaryImageTaskRunning(task: DiaryImageTask): boolean {
  return task.status === "generating" || task.status === "prompting" || task.status === "saving";
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

/** v1 旧条目允许没有配图字段；已出现的新字段须完整有效。 */
export function readDiaryData(data: DiaryData): DiaryData {
  if (data.version !== 1) {
    throw new Error("日记数据版本不受支持");
  }
  if (
    data.settings.autoGenerateImage !== undefined &&
    typeof data.settings.autoGenerateImage !== "boolean"
  ) {
    throw new Error("日记自动配图设置无效");
  }
  for (const entry of data.entries) {
    if (
      entry.imagePrompt !== undefined &&
      (typeof entry.imagePrompt !== "string" || !entry.imagePrompt.trim())
    ) {
      throw new Error("日记配图描述无效");
    }
    if (
      entry.image !== undefined &&
      (!entry.image ||
        typeof entry.image.id !== "string" ||
        !entry.image.id.trim() ||
        typeof entry.image.imagePath !== "string" ||
        !entry.image.imagePath.trim())
    ) {
      throw new Error("日记配图引用无效");
    }
  }
  return {
    ...data,
    settings: { ...data.settings, autoGenerateImage: data.settings.autoGenerateImage ?? false },
  };
}
