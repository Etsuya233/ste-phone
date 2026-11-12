import assert from "node:assert/strict";
import test from "node:test";
import type { ImageHub } from "../../core/image-hub/public.ts";
import { GalleryService } from "./gallery-service.ts";
import type { PhotoIndexEntry, PhotoStorage } from "./photo-storage.ts";
import { galleryImageKey } from "./public.ts";

const missingHub: ImageHub = {
  listImages: async () => {
    throw new Error("未安装");
  },
  generate: async () => {
    throw new Error("未安装");
  },
};

function fixture() {
  const uploaded: string[] = [];
  const indexed: PhotoIndexEntry[] = [];
  const storage: PhotoStorage = {
    list: async () => indexed,
    uploadFile: async (file, id) => {
      uploaded.push(file.name);
      return `/photos/${id}.png`;
    },
    saveIndex: async (entry) => {
      indexed.push(entry);
    },
    imageUrl: (path) => path,
  };
  const validate = async () => "png" as const;
  return { uploaded, indexed, storage, validate };
}

const file = (name: string) => new File(["test"], name, { type: "image/png" });

test("Hub 不可用时手机图库照常上传和浏览，筛选手机图库时不访问 Hub", async () => {
  const { storage, validate } = fixture();
  const gallery = new GalleryService(storage, missingHub, validate);
  await gallery.startUpload([file("one.png")]);
  const all = await gallery.browse();
  assert.equal(all.images.length, 1);
  assert.equal(all.images[0]!.source, "phone");
  assert.equal(all.images[0]!.generation, undefined);
  assert.equal(all.images[0]!.description, undefined);
  assert.deepEqual(all.errors, [{ source: "hub", message: "未安装" }]);
  assert.deepEqual(await gallery.browse("phone"), { images: all.images, errors: [] });
});

test("取消发生在宿主写完文件、索引尚未提交时，保留该照片并停止后续上传", async () => {
  const { storage, validate, uploaded, indexed } = fixture();
  const gallery = new GalleryService(storage, missingHub, validate);
  const original = storage.uploadFile;
  let observedSignal!: AbortSignal;
  storage.uploadFile = async (...args) => {
    observedSignal = args[3];
    const path = await original(...args);
    gallery.dismissUpload();
    assert.equal(gallery.getUploadState().status, "cancelling");
    assert.equal(indexed.length, 0);
    return path;
  };
  await gallery.startUpload([file("first.png"), file("second.png")]);
  assert.ok(observedSignal.aborted);
  assert.deepEqual(uploaded, ["first.png"]);
  assert.equal(indexed.length, 1);
  assert.deepEqual(gallery.getUploadState(), { status: "idle" });
});

test("索引写入失败后继续处理其他照片，重试时只补交失败的索引", async () => {
  const { storage, validate, uploaded, indexed } = fixture();
  const gallery = new GalleryService(storage, missingHub, validate);
  const saveIndex = storage.saveIndex;
  let firstEntry: PhotoIndexEntry | undefined;
  storage.saveIndex = async (entry) => {
    if (!firstEntry) {
      firstEntry = entry;
      throw new Error("索引保存失败");
    }
    await saveIndex(entry);
  };
  await gallery.startUpload([file("first.png"), file("second.png")]);
  const failure = gallery.getUploadState();
  assert.equal(failure.status, "failed");
  assert.equal(failure.completed, 1);
  assert.equal(failure.failures[0]!.message, "索引保存失败");
  assert.deepEqual(uploaded, ["first.png", "second.png"]);
  await gallery.retryUpload();
  assert.deepEqual(uploaded, ["first.png", "second.png"]);
  assert.equal(indexed[1], firstEntry);
  assert.equal(gallery.getUploadState().status, "idle");
});

test("文件请求取消传递中止信号，已经失败的项可重试且取消项不计入新进度", async () => {
  const { storage, validate, uploaded } = fixture();
  const gallery = new GalleryService(storage, missingHub, validate);
  const uploadFile = storage.uploadFile;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  storage.uploadFile = async (input, id, format, signal) => {
    if (input.name === "failed.png") {
      throw new Error("上传失败");
    }
    markStarted();
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason)),
    );
    return uploadFile(input, id, format, signal);
  };
  const task = gallery.startUpload([
    file("failed.png"),
    file("cancelled.png"),
    file("skipped.png"),
  ]);
  await started;
  gallery.dismissUpload();
  await task;
  const state = gallery.getUploadState();
  assert.equal(state.status, "failed");
  assert.equal(state.total, 3);
  assert.equal(state.failures.length, 1);
  storage.uploadFile = uploadFile;
  const retry = gallery.retryUpload();
  const progress = gallery.getUploadState();
  assert.equal(progress.status, "uploading");
  assert.equal(progress.total, 1);
  await retry;
  assert.deepEqual(uploaded, ["failed.png"]);
  assert.equal(gallery.getUploadState().status, "idle");
});

test("同 ID 的两个来源分别保留，合并顺序按实际时间而非时区字符串", async () => {
  const { storage, indexed, validate } = fixture();
  indexed.push({
    version: 1,
    id: "same",
    imagePath: "/photos/one.png",
    savedAt: "2026-11-12T10:00:00+08:00",
  });
  const hub: ImageHub = {
    ...missingHub,
    listImages: async () => [
      {
        id: "same",
        imagePath: "/hub/one.png",
        prompt: "窗外",
        savedAt: "2026-11-12T03:00:00Z",
        startedAt: "2026-11-12T02:59:00Z",
      },
    ],
  };
  const gallery = new GalleryService(storage, hub, validate);
  const { images } = await gallery.browse();
  assert.deepEqual(images.map(galleryImageKey), ["hub:same", "phone:same"]);
  assert.deepEqual(images[0]!.generation, { prompt: "窗外", startedAt: "2026-11-12T02:59:00Z" });
});
