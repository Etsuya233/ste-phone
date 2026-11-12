import type { ImageHub } from "../../core/image-hub/public.ts";
import { fromPhotoIndex, validatePhoto } from "./photo-storage.ts";
import type { PhotoIndexEntry, PhotoStorage } from "./photo-storage.ts";
import { fromHubImage } from "./public.ts";
import type {
  GalleryBrowseResult,
  GalleryFilter,
  GalleryImage,
  GalleryPublic,
  GallerySource,
} from "./public.ts";

type UploadItem = { file: File; entry?: undefined } | { file: File; entry: PhotoIndexEntry };
interface FailedItem {
  readonly item: UploadItem;
  readonly message: string;
}
interface UploadBatch {
  readonly total: number;
  readonly completed: number;
}
export type PhotoUploadState =
  | { readonly status: "idle" }
  | (UploadBatch & {
      readonly status: "uploading" | "cancelling";
      readonly phase: "validating" | "uploading" | "indexing";
    })
  | (UploadBatch & { readonly status: "failed"; readonly failures: readonly FailedItem[] });

export class GalleryService implements GalleryPublic {
  private uploadState: PhotoUploadState = { status: "idle" };
  private controller: AbortController | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly photoListeners = new Set<() => void>();

  private readonly photos: PhotoStorage;
  private readonly hub: ImageHub;
  private readonly validate: typeof validatePhoto;

  constructor(photos: PhotoStorage, hub: ImageHub, validate = validatePhoto) {
    this.photos = photos;
    this.hub = hub;
    this.validate = validate;
  }

  async browse(filter: GalleryFilter = "all"): Promise<GalleryBrowseResult> {
    const sources: GallerySource[] = filter === "all" ? ["phone", "hub"] : [filter];
    const results = await Promise.allSettled(
      sources.map(async (source) =>
        source === "phone"
          ? (await this.photos.list()).map(fromPhotoIndex)
          : (await this.hub.listImages()).map(fromHubImage),
      ),
    );
    const images: GalleryImage[] = [];
    const errors: GalleryBrowseResult["errors"][number][] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        images.push(...result.value);
      } else {
        errors.push({ source: sources[index]!, message: errorMessage(result.reason) });
      }
    });
    return { images: images.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)), errors };
  }

  imageUrl = (path: string): string => this.photos.imageUrl(path);
  getUploadState = (): PhotoUploadState => this.uploadState;
  subscribeUpload = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribePhotos = (listener: () => void) => {
    this.photoListeners.add(listener);
    return () => {
      this.photoListeners.delete(listener);
    };
  };

  startUpload(files: readonly File[]): Promise<void> {
    if (this.uploadState.status !== "idle" || files.length === 0) {
      throw new Error("无法启动照片上传");
    }
    return this.upload(
      files.map((file) => ({ file })),
      { total: files.length, completed: 0 },
    );
  }

  retryUpload(): Promise<void> {
    const state = this.uploadState;
    if (state.status !== "failed") {
      throw new Error("没有待重试的照片");
    }
    return this.upload(
      state.failures.map(({ item }) => item),
      {
        completed: state.completed,
        total: state.completed + state.failures.length,
      },
    );
  }

  dismissUpload = (): void => {
    const state = this.uploadState;
    if (state.status === "failed") {
      this.publish({ status: "idle" });
    }
    if (state.status === "uploading") {
      this.publish({ ...state, status: "cancelling" });
      this.controller!.abort();
    }
  };

  private publish(state: PhotoUploadState): void {
    this.uploadState = state;
    for (const listener of this.listeners) {
      listener();
    }
  }

  // 一个批次占用服务直到当前操作收尾。页面隐藏或卸载不改变批次的输入和归属。
  private async upload(items: readonly UploadItem[], batch: UploadBatch): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const failures: FailedItem[] = [];
    let { completed } = batch;
    const { total } = batch;
    const phase = (next: "validating" | "uploading" | "indexing") =>
      this.publish({
        status: signal.aborted ? "cancelling" : "uploading",
        phase: next,
        total,
        completed,
      });
    for (const initial of items) {
      let item = initial;
      try {
        if (!item.entry) {
          phase("validating");
          const format = await this.validate(item.file, signal);
          signal.throwIfAborted();
          phase("uploading");
          const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          const imagePath = await this.photos.uploadFile(item.file, id, format, signal);
          item = {
            file: item.file,
            entry: { version: 1, id, imagePath, savedAt: new Date().toISOString() },
          };
        }
        // 取得文件保存确认后必须提交索引。取消只影响文件请求及后续照片。
        phase("indexing");
        await this.photos.saveIndex(item.entry);
        completed++;
        phase("indexing");
      } catch (error) {
        if (item.entry || !signal.aborted) {
          failures.push({ item, message: errorMessage(error) });
        }
      }
      if (signal.aborted) {
        break;
      }
    }
    if (completed > batch.completed) {
      for (const listener of this.photoListeners) {
        listener();
      }
    }
    this.controller = undefined;
    this.publish(
      failures.length > 0 ? { status: "failed", total, completed, failures } : { status: "idle" },
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
