import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { WechatStickerLibrary } from "./wechat-sticker-library.ts";
import { parseStEmoteManifest, readStEmoteArchive } from "./st-emote-archive.ts";
import {
  findWechatSticker,
  wechatStickerCatalog,
  type WechatStickerPack,
} from "./wechat-stickers.ts";
import { parseWechatReply } from "./wechat-prompt.ts";

const gif = Uint8Array.from(
  Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
);
const manifest = {
  format: "st-emote-pack",
  version: 1,
  name: "日常",
  stickers: [
    { label: "开心", description: "开心地挥手", file: "images/happy.gif", placement: "inline" },
    { label: "外链", description: "点头", url: "https://example.com/nod.webp" },
    { label: "待补图", description: "" },
    { label: "", description: "待命名", file: "images/happy.gif" },
  ],
};

async function archive(value: unknown = manifest, image = true): Promise<Blob> {
  const zip = new JSZip();
  zip.file("st-emote.json", JSON.stringify(value));
  if (image) {
    zip.file("images/happy.gif", gif);
  }
  return new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))]);
}

function fixture() {
  let stored: readonly WechatStickerPack[] = [];
  const uploads: { bytes: Uint8Array; format: string }[] = [];
  let failSave = false;
  const storage = {
    read: () => stored,
    save: (packs: readonly WechatStickerPack[]) => {
      if (failSave) {
        throw new Error("保存失败");
      }
      stored = structuredClone(packs);
    },
    upload: async (blob: Blob, format: string) => {
      uploads.push({ bytes: new Uint8Array(await blob.arrayBuffer()), format });
      return "/user/images/ste-phone-stickers/happy.gif";
    },
    imageUrl: (path: string) => path,
  };
  const library = new WechatStickerLibrary(storage);
  return {
    library,
    uploads,
    storage,
    failSave: () => {
      failSave = true;
    },
  };
}

test("st-emote ZIP imports local GIF bytes once, keeps external URLs and unfinished entries", async () => {
  const f = fixture();
  await f.library.importArchive(await archive());
  assert.equal(f.library.getSnapshot().error, null);
  assert.equal(f.uploads.length, 1);
  assert.deepEqual(f.uploads[0], { bytes: gif, format: "gif" });
  const packs = f.library.getSnapshot().packs;
  assert.equal(packs[0]!.enabled, true);
  assert.equal(packs[0]!.stickers[1]!.image, "https://example.com/nod.webp");
  assert.equal(packs[0]!.stickers[2]!.image, "");
  assert.equal(wechatStickerCatalog(packs).length, 2);
  assert.deepEqual(new WechatStickerLibrary(f.storage).getSnapshot().packs, packs);
  await f.library.importArchive(await archive());
  assert.match(f.library.getSnapshot().error!, /已存在/);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.library.getSnapshot().packs.length, 1);
});

test("pack toggle changes rendering and model choices while retaining original messages and persisted state", async () => {
  const f = fixture();
  await f.library.importArchive(await archive());
  const raw = "[[sticker:日常:开心]]";
  assert.equal(findWechatSticker(f.library.getSnapshot().packs, raw)?.description, "开心地挥手");
  const contents = parseWechatReply(
    JSON.stringify({ messages: [{ type: "text", text: raw }] }),
    wechatStickerCatalog(f.library.getSnapshot().packs),
  );
  f.library.setEnabled("日常", false);
  assert.equal(findWechatSticker(f.library.getSnapshot().packs, raw), undefined);
  assert.deepEqual(wechatStickerCatalog(f.library.getSnapshot().packs), []);
  assert.equal(contents[0]!.text, raw);
  assert.equal(new WechatStickerLibrary(f.storage).getSnapshot().packs[0]!.enabled, false);
  assert.throws(() => parseWechatReply(JSON.stringify({ messages: contents }), []), /不可用/);
  f.library.setEnabled("日常", true);
  assert.ok(findWechatSticker(f.library.getSnapshot().packs, contents[0]!.text));
  assert.equal(
    findWechatSticker(f.library.getSnapshot().packs, "[[sticker:不存在:开心]]"),
    undefined,
  );
});

test("invalid archives fail before uploading or publishing any pack", async () => {
  const f = fixture();
  await f.library.importArchive(await archive(manifest, false));
  assert.match(f.library.getSnapshot().error!, /缺少图片/);
  assert.equal(f.uploads.length, 0);
  assert.deepEqual(f.library.getSnapshot().packs, []);
  const zip = new JSZip();
  zip.file(
    "st-emote.json",
    JSON.stringify({
      ...manifest,
      stickers: [{ label: "大图", description: "", file: "big.png" }],
    }),
  );
  zip.file("big.png", new Uint8Array(5 * 1024 * 1024 + 1));
  await assert.rejects(
    readStEmoteArchive(new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" }))])),
    /超过 5 MB/,
  );
  for (const change of [
    { version: 2 },
    { name: "bad:name" },
    { stickers: [{ label: "开心", description: "", file: "../image.png" }] },
    { stickers: [{ label: "开心", description: "", url: "javascript:alert(1)" }] },
    { stickers: [{ label: "开心", description: "", url: "http://" }] },
    { stickers: [manifest.stickers[0], manifest.stickers[0]] },
  ]) {
    assert.throws(() => parseStEmoteManifest(JSON.stringify({ ...manifest, ...change })));
  }
});

test("save failure preserves the previous library and exposes the error", async () => {
  const f = fixture();
  await f.library.importArchive(await archive());
  f.failSave();
  f.library.setEnabled("日常", false);
  assert.equal(f.library.getSnapshot().packs[0]!.enabled, true);
  assert.match(f.library.getSnapshot().error!, /保存失败/);
  await f.library.importArchive(await archive({ ...manifest, name: "新包" }));
  assert.equal(f.library.getSnapshot().packs.length, 1);
  assert.equal(f.library.getSnapshot().importing, false);
});
