import assert from "node:assert/strict";
import test from "node:test";
import { readWechatData, validateWechatData } from "./wechat-migrations.ts";
import { emptyWechat } from "./wechat.ts";
import { createPreviewWechatStorage } from "../../../docs/ui/preview-wechat-storage.ts";

const author = { id: "a", scopeId: "stable", name: "甲" };
const other = { id: "b", scopeId: "stable", name: "乙" };
const createdAt = "2026-11-04T00:00:00Z";
const conversation = {
  id: "pair",
  people: [author, other],
  messages: [
    { id: "user", senderId: "a", content: { type: "text", text: "你好" }, createdAt },
    {
      id: "reply",
      senderId: "b",
      content: { type: "text", text: "你好呀" },
      createdAt,
      reply: { batchId: "batch", triggerMessageId: "user" },
    },
  ],
  pendingReplies: { a: "user" },
  pendingCompletedThrough: { a: "user" },
  memoryBarriers: [{ id: "barrier", afterMessageId: "user", enabled: true }],
};

test("微信 v1 所有已发布媒体结构统一升级，保留其他微信字段且不改原输入", () => {
  const image = {
    description: "实图",
    prompt: "窗边近景",
    image: { id: "hub", imagePath: "/image.png" },
  };
  const legacy = {
    version: 1,
    account: author,
    conversations: [conversation],
    replyGuidance: { stable: { a: "多用短句" } },
    moments: {
      stable: [
        { type: "none" },
        { type: "images", descriptions: ["描述一", "描述二"] },
        { type: "images", items: [image] },
        { type: "video", description: "旧视频" },
        [
          { type: "video", description: "新视频" },
          { type: "image", ...image },
        ],
      ].map((media, index) => ({
        id: `moment-${index}`,
        author,
        text: "正文",
        media,
        createdAt,
        comments: [],
      })),
    },
  };
  const original = structuredClone(legacy);
  const loaded = readWechatData(legacy);
  const currentImage = { ...image, image: { ...image.image, source: "hub" } };
  assert.equal(loaded.version, 4);
  assert.deepEqual(legacy, original);
  assert.deepEqual(loaded.conversations, legacy.conversations);
  assert.deepEqual(loaded.account, author);
  assert.deepEqual(loaded.replyGuidance, legacy.replyGuidance);
  assert.deepEqual(
    loaded.moments!.stable!.map((moment) => moment.media),
    [
      [],
      [
        { type: "image", description: "描述一" },
        { type: "image", description: "描述二" },
      ],
      [{ type: "image", ...currentImage }],
      [{ type: "video", description: "旧视频" }],
      [
        { type: "video", description: "新视频" },
        { type: "image", ...currentImage },
      ],
    ],
  );
  assert.deepEqual(readWechatData({ version: 1, account: null, conversations: [] }), emptyWechat());
  assert.deepEqual(readWechatData(loaded), loaded);
});

test("当前 v3 严格校验，不再转换旧媒体；非法版本与损坏微信字段明确失败", () => {
  const moment = { id: "moment", author, text: "正文", createdAt, comments: [] };
  for (const media of [
    { type: "none" },
    { type: "images", descriptions: ["旧图"] },
    [{ type: "video", description: "" }],
  ]) {
    assert.throws(() =>
      readWechatData({ ...emptyWechat(), moments: { stable: [{ ...moment, media }] } }),
    );
  }
  for (const data of [
    { account: null, conversations: [] },
    { ...emptyWechat(), version: 5 },
    { ...emptyWechat(), version: "2" },
    { ...emptyWechat(), account: {} },
    { ...emptyWechat(), conversations: {} },
    { ...emptyWechat(), replyGuidance: { stable: { a: 2 } } },
    {
      ...emptyWechat(),
      conversations: [
        { ...conversation, messages: [{ ...conversation.messages[0], senderId: "unknown" }] },
      ],
    },
    { ...emptyWechat(), conversations: [{ ...conversation, pendingReplies: { a: "missing" } }] },
    {
      ...emptyWechat(),
      conversations: [
        {
          ...conversation,
          memoryBarriers: [{ id: "invalid", afterMessageId: "missing", enabled: true }],
        },
      ],
    },
  ]) {
    assert.throws(() => readWechatData(data));
  }
  assert.throws(() => validateWechatData({ ...emptyWechat(), version: 1 }));
  const broken = {
    version: 1,
    account: null,
    conversations: [],
    moments: {
      stable: [{ ...moment, media: { type: "images", descriptions: ["旧"], items: ["新"] } }],
    },
  };
  const original = structuredClone(broken);
  assert.throws(() => readWechatData(broken));
  assert.deepEqual(broken, original);
});

test("预览读取复用迁移链且不写盘，正常保存才持久化 v3", async () => {
  const values = new Map<string, string>();
  const savedDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem(key: string, value: string) {
        ++writes;
        values.set(key, value);
      },
    },
  });
  try {
    const key = "ste-phone-preview-wechat:chat";
    const original = JSON.stringify({ version: 1, account: author, conversations: [conversation] });
    values.set(key, original);
    const storage = createPreviewWechatStorage(null);
    const loaded = storage.read("chat")!;
    assert.equal(loaded.version, 4);
    assert.equal(writes, 0);
    assert.equal(values.get(key), original);
    await storage.write("chat", loaded);
    assert.equal(writes, 1);
    assert.equal(JSON.parse(values.get(key)!).version, 4);
    assert.deepEqual(storage.read("chat"), loaded);
  } finally {
    if (savedDescriptor) {
      Object.defineProperty(globalThis, "localStorage", savedDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
