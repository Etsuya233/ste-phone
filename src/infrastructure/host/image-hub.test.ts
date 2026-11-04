import assert from "node:assert/strict";
import { test } from "node:test";
import { createStImageHub } from "./image-hub.ts";
import type { ImageHub, ImageRecord } from "../../core/image-hub/public.ts";

test("missing and incompatible Hub fail at operation time, and later installation works", async () => {
  let available: (ImageHub & { version: number }) | undefined;
  const hub = createStImageHub(() => available);
  await assert.rejects(hub.listImages(), /安装并启用/);
  available = { version: 2, listImages: async () => [], generate: async () => [] };
  await assert.rejects(hub.generate({ prompt: "山谷" }), /版本不兼容/);
  available = { ...available, version: 1 };
  assert.deepEqual(await hub.listImages(), []);
});

test("Hub owns generation, results and errors pass through without chatting or storage", async () => {
  const images: ImageRecord[] = [
    {
      id: "a",
      imagePath: "/user/images/a.png",
      prompt: "雨中花店",
      startedAt: "2026-11-04T00:00:00.000Z",
      savedAt: "2026-11-04T00:00:01.000Z",
    },
  ];
  const calls: string[] = [];
  const failure = new Error("Hub 正在生成图片");
  const hub = createStImageHub(() => ({
    version: 1,
    listImages: async () => images,
    generate: async ({ prompt }) => {
      calls.push(prompt);
      if (calls.length === 2) {
        throw failure;
      }
      return images;
    },
  }));
  assert.equal(await hub.listImages(), images);
  assert.equal(await hub.generate({ prompt: "雨中花店" }), images);
  await assert.rejects(hub.generate({ prompt: "第二次" }), (error) => error === failure);
  assert.deepEqual(calls, ["雨中花店", "第二次"]);
});
