import assert from "node:assert/strict";
import test from "node:test";
import { createStPhotoStorage } from "./gallery-storage.ts";

const id = "a".repeat(32);
const pending = "b".repeat(32);
const path = `/user/images/ste-phone-photos/${id}.png`;
const indexName = `ste-phone-photos-${id}.json`;
const indexPath = `/user/files/${indexName}`;
const pendingIndex = `/user/files/ste-phone-photos-${pending}.json`;
const entry = { version: 1 as const, id, imagePath: path, savedAt: "2026-11-12T08:00:00.000Z" };
const context = { getRequestHeaders: () => ({ "X-CSRF-Token": "test" }) };

test("ST 账号图库使用独立图片目录，文件和逐图索引按宿主响应确认", async () => {
  const signal = new AbortController().signal;
  const requests: string[] = [];
  const request: typeof fetch = async (input, init) => {
    requests.push(String(input));
    assert.deepEqual(init?.headers, context.getRequestHeaders());
    if (input === "/api/images/upload") {
      assert.equal(init?.signal, signal);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        ch_name: "ste-phone-photos",
        format: "png",
        filename: id,
        image: "cG5n",
      });
      return Response.json({ path });
    }
    assert.equal(input, "/api/files/upload");
    assert.equal(init?.signal, undefined);
    const { name, data } = JSON.parse(String(init?.body));
    assert.equal(name, indexName);
    assert.deepEqual(JSON.parse(Buffer.from(data, "base64").toString("utf8")), entry);
    return Response.json({ path: indexPath });
  };
  const storage = createStPhotoStorage(context, request);
  assert.equal(
    await storage.uploadFile(new File(["png"], "original.png"), id, "png", signal),
    path,
  );
  await storage.saveIndex(entry);
  assert.deepEqual(requests, ["/api/images/upload", "/api/files/upload"]);
});

test("仅展示存在有效索引的照片，索引缺失与索引损坏分别处理", async () => {
  let indexVersion = 1;
  const request: typeof fetch = async (input, init) => {
    if (input === "/api/images/list") {
      assert.equal(JSON.parse(String(init?.body)).folder, "ste-phone-photos");
      return Response.json([`${id}.png`, `${pending}.jpg`, "external.webp"]);
    }
    if (input === "/api/files/verify") {
      assert.deepEqual(JSON.parse(String(init?.body)), { urls: [indexPath, pendingIndex] });
      return Response.json({ [indexPath]: true, [pendingIndex]: false });
    }
    assert.equal(input, indexPath);
    return Response.json({ ...entry, version: indexVersion });
  };
  const storage = createStPhotoStorage(context, request);
  assert.deepEqual(await storage.list(), [entry]);
  indexVersion = 99;
  await assert.rejects(storage.list(), /照片索引无效/);
});
