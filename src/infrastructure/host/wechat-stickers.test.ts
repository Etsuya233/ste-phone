import assert from "node:assert/strict";
import test from "node:test";
import { createStWechatStickerStorage } from "./wechat-stickers.ts";
import type { WechatStickerPack } from "../../apps/wechat/wechat-stickers.ts";

test("ST sticker storage persists only metadata and uploads original GIF bytes to its own folder", async () => {
  const extensionSettings: {
    ste_phone_wechat_stickers?: { version: number; packs: readonly WechatStickerPack[] };
    other: string;
  } = { other: "kept" };
  let saved = 0;
  const context = {
    extensionSettings,
    saveSettingsDebounced: () => {
      saved++;
    },
    getRequestHeaders: () => ({ "X-CSRF-Token": "csrf" }),
  };
  const bodies: { image: string; format: string; ch_name: string; filename: string }[] = [];
  const storage = createStWechatStickerStorage(
    () => context,
    async (url, init) => {
      assert.equal(url, "/api/images/upload");
      assert.deepEqual(init!.headers, { "X-CSRF-Token": "csrf" });
      bodies.push(JSON.parse(init!.body as string));
      return Response.json({ path: "/user/images/ste-phone-stickers/example.gif" });
    },
  );
  assert.deepEqual(storage.read(), []);
  const bytes = Uint8Array.from([71, 73, 70, 56, 57, 97]);
  const path = await storage.upload(new Blob([bytes]), "gif");
  assert.equal(path, "/user/images/ste-phone-stickers/example.gif");
  assert.equal(bodies[0]!.image, Buffer.from(bytes).toString("base64"));
  assert.equal(bodies[0]!.format, "gif");
  assert.equal(bodies[0]!.ch_name, "ste-phone-stickers");
  assert.match(bodies[0]!.filename, /^[a-f0-9]{32}$/u);
  storage.save([
    {
      name: "日常",
      enabled: false,
      stickers: [{ label: "开心", description: "开心", image: path }],
    },
  ]);
  assert.equal(saved, 1);
  assert.equal(storage.read()[0]!.enabled, false);
  assert.equal(extensionSettings.other, "kept");
  assert.equal(storage.imageUrl(path), path);
  extensionSettings.ste_phone_wechat_stickers!.version = 2;
  assert.throws(() => storage.read(), /版本不受支持/);
});

test("ST upload reports HTTP errors", async () => {
  const storage = createStWechatStickerStorage(
    () => ({ extensionSettings: {}, saveSettingsDebounced() {}, getRequestHeaders: () => ({}) }),
    async () => new Response(null, { status: 413 }),
  );
  await assert.rejects(storage.upload(new Blob(["gif"]), "gif"), /413/);
});
