import type { GalleryImage } from "./public.ts";

export const photoFormats = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export const photoAccept = Object.keys(photoFormats).join(",");
export type PhotoFormat = (typeof photoFormats)[keyof typeof photoFormats];

export interface PhotoIndexEntry {
  readonly version: 1;
  readonly id: string;
  readonly imagePath: string;
  readonly savedAt: string;
}

export interface PhotoStorage {
  list(): Promise<readonly PhotoIndexEntry[]>;
  uploadFile(file: File, id: string, format: PhotoFormat, signal: AbortSignal): Promise<string>;
  saveIndex(entry: PhotoIndexEntry): Promise<void>;
  imageUrl(path: string): string;
}

export function readPhotoIndex(value: unknown, id: string, imagePath: string): PhotoIndexEntry {
  const entry = value as Partial<PhotoIndexEntry> | null;
  if (
    entry?.version !== 1 ||
    entry.id !== id ||
    entry.imagePath !== imagePath ||
    typeof entry.savedAt !== "string" ||
    !Number.isFinite(Date.parse(entry.savedAt))
  ) {
    throw new Error(`照片索引无效（${id}）`);
  }
  return { version: 1, id, imagePath, savedAt: entry.savedAt };
}

export function fromPhotoIndex({ id, imagePath, savedAt }: PhotoIndexEntry): GalleryImage {
  return { source: "phone", id, imagePath, savedAt };
}

export async function validatePhoto(file: File, signal: AbortSignal): Promise<PhotoFormat> {
  const format = photoFormats[file.type as keyof typeof photoFormats];
  if (!Object.hasOwn(photoFormats, file.type)) {
    throw new Error("仅支持 PNG、JPEG 和 WebP 照片");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("单张照片不能超过 10 MB");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signature = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const matches = {
    png: signature.startsWith("89504e470d0a1a0a"),
    jpg: signature.startsWith("ffd8ff"),
    webp: signature.startsWith("52494646") && signature.slice(16) === "57454250",
  };
  if (!matches[format]) {
    throw new Error("照片内容与文件格式不符");
  }
  signal.throwIfAborted();
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
  } catch {
    throw new Error("无法解码照片");
  }
  signal.throwIfAborted();
  return format;
}
