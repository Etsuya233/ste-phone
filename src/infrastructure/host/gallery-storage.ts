import { readPhotoIndex } from "../../apps/gallery/photo-storage.ts";
import type { PhotoIndexEntry, PhotoStorage } from "../../apps/gallery/photo-storage.ts";
import { encodeBase64 } from "../browser/base64.ts";

const folder = "ste-phone-photos";
const filenamePattern = /^([a-f0-9]{32})\.(?:png|jpg|webp)$/;
const indexName = (id: string) => `${folder}-${id}.json`;
const indexPath = (id: string) => `/user/files/${indexName(id)}`;

export function createStPhotoStorage(
  context: Pick<
    ReturnType<typeof window.SillyTavern.getContext>,
    "getRequestHeaders"
  > = window.SillyTavern.getContext(),
  request = fetch,
): PhotoStorage {
  async function post(path: string, body: unknown, action: string, signal?: AbortSignal) {
    const response = await request(path, {
      method: "POST",
      headers: context.getRequestHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new Error(`${action}失败（${response.status}）`);
    }
    return response.json();
  }

  return {
    imageUrl: (path) => path,
    list: async () => {
      const filenames = (await post(
        "/api/images/list",
        { folder, sortField: "name" },
        "列出照片",
      )) as string[];
      const files = filenames.flatMap((filename) => {
        const match = filenamePattern.exec(filename);
        return match ? [{ id: match[1]!, imagePath: `/user/images/${folder}/${filename}` }] : [];
      });
      const result: PhotoIndexEntry[] = [];
      // 各照片独立提交索引。批量检查存在性，再以最多 8 个并发请求读取，避免遗漏的索引产生 404。
      for (let offset = 0; offset < files.length; offset += 128) {
        const batch = files.slice(offset, offset + 128);
        const urls = batch.map(({ id }) => indexPath(id));
        const verified = (await post("/api/files/verify", { urls }, "检查照片索引")) as Record<
          string,
          boolean
        >;
        const indexed = batch.filter(({ id }) => {
          const exists = verified[indexPath(id)];
          if (typeof exists !== "boolean") {
            throw new Error("照片索引检查返回无效结果");
          }
          return exists;
        });
        for (let start = 0; start < indexed.length; start += 8) {
          const entries = await Promise.all(
            indexed.slice(start, start + 8).map(async ({ id, imagePath }) => {
              const response = await request(indexPath(id), { cache: "no-store" });
              if (!response.ok) {
                throw new Error(`读取照片索引失败（${response.status}）`);
              }
              return readPhotoIndex(await response.json(), id, imagePath);
            }),
          );
          result.push(...entries);
        }
      }
      return result;
    },
    uploadFile: async (file, id, format, signal) => {
      const image = encodeBase64(new Uint8Array(await file.arrayBuffer()));
      signal.throwIfAborted();
      const expected = `/user/images/${folder}/${id}.${format}`;
      const saved = (await post(
        "/api/images/upload",
        {
          ch_name: folder,
          image,
          format,
          filename: id,
        },
        "保存照片",
        signal,
      )) as { path: string };
      if (saved.path !== expected) {
        throw new Error("宿主返回了意外的照片路径");
      }
      return saved.path;
    },
    saveIndex: async (entry) => {
      const data = encodeBase64(new TextEncoder().encode(JSON.stringify(entry)));
      const saved = (await post(
        "/api/files/upload",
        { name: indexName(entry.id), data },
        "保存照片索引",
      )) as { path: string };
      if (saved.path !== indexPath(entry.id)) {
        throw new Error("宿主返回了意外的照片索引路径");
      }
    },
  };
}
