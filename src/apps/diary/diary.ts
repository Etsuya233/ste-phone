import { migrateData, type MigrationPlan } from "../../core/storage/migrations.ts";
import { isGalleryImageReference, type GalleryImageReference } from "../gallery/public.ts";

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
  readonly sourceId: string;
  readonly scopeId: string;
}

export interface DiaryEntry {
  readonly id: string;
  readonly author: Omit<DiaryAuthor, "profileText">;
  readonly worldTime: string;
  readonly body: string;
  readonly imagePrompt?: string;
  readonly image?: GalleryImageReference;
  readonly createdAt: string;
}

export interface DiaryData {
  readonly version: 2;
  readonly author: DiaryAuthor | null;
  readonly settings: DiarySettings;
  readonly entries: readonly DiaryEntry[];
}

export function createEmptyDiary(): DiaryData {
  return {
    version: 2,
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

const diaryMigrations: MigrationPlan<DiaryData> = {
  currentVersion: 2,
  steps: [
    {
      from: 1,
      to: 2,
      name: "diary-gallery-source",
      migrate(value) {
        const data = value as { entries: { image?: { id: string; imagePath: string } }[] };
        for (const entry of data.entries) {
          if (entry.image) {
            Object.assign(entry.image, { source: "hub" });
          }
        }
        return data;
      },
    },
  ],
  validate: validateDiaryData,
};

function validateDiaryData(value: unknown): asserts value is DiaryData {
  const data = value as DiaryData;
  if (!Array.isArray(data.entries)) {
    throw new Error("日记条目无效");
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
    if (entry.image !== undefined && !isGalleryImageReference(entry.image)) {
      throw new Error("日记配图引用无效");
    }
  }
}

export function readDiaryData(value: unknown): DiaryData {
  const { data } = migrateData(value, diaryMigrations);
  return {
    ...data,
    settings: { ...data.settings, autoGenerateImage: data.settings.autoGenerateImage ?? false },
  };
}
