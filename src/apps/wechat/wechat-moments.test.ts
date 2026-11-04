import type { ImageRecord } from "../../core/image-hub/public.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { emptyWechat, type WechatData, type WechatSnapshot } from "./wechat.ts";
import { momentDraftIssue, normalizeMomentContent, type MomentContent } from "./wechat-moments.ts";
import { migrateWechatMoments, validateWechatMoments } from "./wechat-moments-storage.ts";
import { WechatMomentsService } from "./wechat-moments-service.ts";
import { WechatWrites } from "./wechat-writes.ts";

function fixture() {
  let snapshot: WechatSnapshot = {
    chatId: "chat-a",
    data: { ...emptyWechat(), replyGuidance: { stable: { a: "轻松" } } },
    people: [
      { id: "a", name: "同名", profileText: "甲" },
      { id: "b", name: "同名", profileText: "乙" },
    ],
    scopeId: "stable",
    momentsScopeId: "stable",
    loading: false,
    error: null,
    reply: { status: "idle" },
    momentGeneration: { status: "idle" },
    writeBusy: false,
    barrierSaving: false,
    operationError: null,
  };
  const stored = new Map<string, WechatData>();
  let failSave = false;
  let generating = false;
  let generateImages: () => Promise<readonly ImageRecord[]> = async () => [];
  const writes = new WechatWrites(
    {
      read: (chatId) => stored.get(chatId) ?? null,
      write: async (chatId, data) => {
        if (failSave) {
          throw new Error("磁盘失败");
        }
        validateWechatMoments(data.moments);
        stored.set(chatId, structuredClone(data));
      },
    },
    () => snapshot,
    (patch) => {
      snapshot = { ...snapshot, ...patch };
    },
  );
  const service = new WechatMomentsService({
    imageHub: { listImages: async () => [], generate: () => generateImages() },
    data: {} as ConstructorParameters<typeof WechatMomentsService>[0]["data"],
    transport: {
      createStream: () => {
        throw new Error("手动操作不应调用模型");
      },
    },
    connections: {
      getSnapshot: () => ({ defaultModelConnectionId: null, connections: [] }),
      getConnection: () => {
        throw new Error("无模型");
      },
      subscribe: () => () => {},
    },
    publishGeneration: (momentGeneration) => {
      snapshot = { ...snapshot, momentGeneration };
    },
    snapshot: () => snapshot,
    busy: () => writes.busy || generating,
    save: (update, signal) => writes.save(update, signal),
  });
  return {
    service,
    imageGenerator: (generate: typeof generateImages) => {
      generateImages = generate;
    },
    writes,
    stored,
    snapshot: () => snapshot,
    account: (id: string, scopeId = "stable") => {
      snapshot = {
        ...snapshot,
        scopeId,
        data: { ...snapshot.data, account: { id, scopeId, name: "旧名" } },
      };
    },
    patch: (patch: Partial<WechatSnapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    failSave: () => {
      failSave = true;
    },
    generating: () => {
      generating = true;
    },
  };
}

test("朋友圈文字和媒体去首尾空白并保留段落，接受仅媒体和九图", () => {
  assert.deepEqual(
    normalizeMomentContent({ text: "  第一段\n\n第二段  ", media: { type: "none" } }),
    {
      text: "第一段\n\n第二段",
      media: { type: "none" },
    },
  );
  assert.deepEqual(
    normalizeMomentContent({ text: " ", media: { type: "video", description: " 视频 " } }),
    {
      text: "",
      media: { type: "video", description: "视频" },
    },
  );
  assert.equal(
    normalizeMomentContent({
      text: "",
      media: { type: "images", items: Array(9).fill({ description: " 图片 " }) },
    }).media.type,
    "images",
  );
  for (const content of [
    { text: " ", media: { type: "none" } },
    { text: "正文", media: { type: "images", items: [] } },
    {
      text: "正文",
      media: {
        type: "images",
        items: [" "].map((description) => ({ description, prompt: description.trim() })),
      },
    },
    { text: "正文", media: { type: "images", items: Array(10).fill({ description: "图片" }) } },
    { text: "正文", media: { type: "video", description: " " } },
    { text: "正文", media: { type: "audio" } },
  ]) {
    assert.throws(() => normalizeMomentContent(content as MomentContent));
  }
});

test("发布页在提交前标出空正文、空视频描述和缺描述的图片", () => {
  assert.equal(momentDraftIssue({ text: " ", media: { type: "none" } })?.kind, "empty");
  assert.equal(
    momentDraftIssue({ text: " ", media: { type: "images", items: [] } })?.kind,
    "empty",
  );
  assert.equal(
    momentDraftIssue({ text: " ", media: { type: "video", description: " " } })?.kind,
    "video",
  );
  assert.deepEqual(
    momentDraftIssue({
      text: "",
      media: { type: "images", items: [{ description: "图片" }, { description: " " }] },
    }),
    { kind: "image", index: 1, message: "第 2 张图片需要填写描述。" },
  );
  assert.equal(
    momentDraftIssue({ text: "", media: { type: "images", items: [{ description: "图片" }] } }),
    null,
  );
  assert.equal(momentDraftIssue({ text: "", media: { type: "video", description: "视频" } }), null);
});

test("共享朋友圈按追加排序，同名人物按身份评论回复，删除目标保留署名", async () => {
  const f = fixture();
  f.account("a");
  const first = await f.service.publish({ text: "第一条", media: { type: "none" } });
  const second = await f.service.publish({ text: "第二条", media: { type: "none" } });
  f.account("b");
  await f.service.comment(first, "  评论\n内容  ");
  const target = f.snapshot().data.moments!.stable![0]!.comments[0]!;
  assert.equal(target.author.id, "b");
  assert.equal(target.author.name, "同名");
  f.account("a");
  await f.service.comment(first, "回复乙", target.id);
  let moment = f.snapshot().data.moments!.stable![0]!;
  await f.service.comment(first, "回复自己的回复", moment.comments[1]!.id);
  await assert.rejects(f.service.deleteComment(first, target.id), /只能删除/);
  f.account("b");
  await f.service.deleteComment(first, target.id);
  moment = f.snapshot().data.moments!.stable![0]!;
  assert.equal(moment.comments.length, 2);
  assert.deepEqual(moment.comments[0]!.replyTo, { commentId: target.id, author: target.author });
  assert.equal(JSON.stringify(moment).includes("评论\\n内容"), false);
  assert.deepEqual(
    f.snapshot().data.moments!.stable!.map((item) => item.id),
    [first, second],
  );
  validateWechatMoments(f.snapshot().data.moments);
  await assert.rejects(f.service.comment(first, "迟到回复", target.id), /目标已删除/);
  await assert.rejects(f.service.deleteMoment(first), /只能删除/);
  f.account("a");
  await f.service.deleteMoment(first);
  assert.equal(f.snapshot().data.moments!.stable!.length, 1);
  assert.deepEqual(f.snapshot().data.replyGuidance, { stable: { a: "轻松" } });
  assert.deepEqual(f.snapshot().data.conversations, []);
});

test("空间与聊天独立，失败不发布结果，缺少有效帐号和生成期间拒绝写入", async () => {
  const f = fixture();
  await assert.rejects(
    f.service.publish({ text: "无帐号", media: { type: "none" } }),
    /资料不可用/,
  );
  f.account("a");
  const first = await f.service.publish({ text: "空间一", media: { type: "none" } });
  f.account("a", "other");
  await assert.rejects(f.service.comment(first, "跨空间"), /不存在/);
  await f.service.publish({ text: "空间二", media: { type: "none" } });
  assert.equal(f.snapshot().data.moments!.stable!.length, 1);
  assert.equal(f.snapshot().data.moments!.other!.length, 1);
  f.writes.changedChat();
  f.patch({
    chatId: "chat-b",
    data: { ...emptyWechat(), account: { id: "a", scopeId: "other", name: "甲" } },
  });
  await f.service.publish({ text: "另一个聊天", media: { type: "none" } });
  assert.equal(f.stored.get("chat-a")!.moments!.other![0]!.text, "空间二");
  const before = f.snapshot().data;
  f.failSave();
  await assert.rejects(f.service.publish({ text: "失败", media: { type: "none" } }), /磁盘失败/);
  assert.equal(f.snapshot().data, before);
  f.generating();
  await assert.rejects(f.service.deleteMoment(first), /等待当前生成/);
  f.patch({ error: "断开", people: [] });
  assert.equal(f.snapshot().data.moments!.other![0]!.text, "另一个聊天");
});

test("朋友圈元数据显式兼容旧 v1，拒绝损坏媒体、跨空间人物与非法回复", async () => {
  validateWechatMoments(undefined);
  const f = fixture();
  f.account("a");
  const id = await f.service.publish({
    text: "正文",
    media: {
      type: "images",
      items: ["图片"].map((description) => ({ description, prompt: description.trim() })),
    },
  });
  await f.service.comment(id, "评论");
  const moment = f.snapshot().data.moments!.stable![0]!;
  const comment = moment.comments[0]!;
  for (const records of [
    [{ ...moment, media: { ...moment.media, description: "混合视频" } }],
    [{ ...moment, author: { ...moment.author, scopeId: "other" } }],
    [
      {
        ...moment,
        comments: [{ ...comment, replyTo: { commentId: comment.id, author: comment.author } }],
      },
    ],
    [{ ...moment, createdAt: "bad" }],
    [moment, moment],
  ]) {
    assert.throws(() => validateWechatMoments({ stable: records }));
  }
});

test("旧图片描述只在读取时迁移，混用字段与非法新图片拒绝保存", () => {
  const data = {
    stable: [
      {
        id: "old",
        author: { id: "a", name: "甲", scopeId: "stable" },
        createdAt: "2026-11-04T00:00:00Z",
        text: "",
        media: { type: "images", descriptions: ["旧图片"] },
        comments: [],
      },
    ],
  };
  assert.throws(() => validateWechatMoments(data));
  migrateWechatMoments(data);
  assert.deepEqual(data.stable[0]!.media, { type: "images", items: [{ description: "旧图片" }] });
  assert.throws(() =>
    normalizeMomentContent({
      text: "",
      media: { type: "images", items: [{ description: "图", image: { id: "", imagePath: "x" } }] },
    }),
  );
  assert.throws(() =>
    migrateWechatMoments({
      stable: [
        {
          ...data.stable[0],
          media: { type: "images", descriptions: ["旧"], items: [{ description: "新" }] },
        },
      ],
    }),
  );
});

const imageRecord = {
  id: "hub-first",
  imagePath: "/images/first.png",
  prompt: "画",
  startedAt: "2026-11-04T00:00:00Z",
  savedAt: "2026-11-04T00:00:01Z",
};

test("图片调序保留引用，跨作者手动生成仅关联选定图片，其他结果留图库", async () => {
  const f = fixture();
  f.account("a");
  const id = await f.service.publish({
    text: "动态",
    media: {
      type: "images",
      items: [
        {
          description: "第二张",
          prompt: "窗边的笔记本",
          image: { id: "previous", imagePath: "/previous.png" },
        },
        { description: "第一张", prompt: "树叶" },
      ],
    },
  });
  f.account("b");
  let received = "";
  f.imageGenerator(async () => {
    received = "called";
    return [imageRecord, { ...imageRecord, id: "hub-second" }];
  });
  await f.service.saveImagePrompt(id, 1, "新 Prompt");
  await f.service.generateImage(id, 1);
  const media = f.snapshot().data.moments!.stable![0]!.media;
  assert.equal(received, "called");
  assert.equal(media.type, "images");
  if (media.type !== "images") {
    throw new Error("预期图片");
  }
  assert.deepEqual(media.items[0]!.image, { id: "previous", imagePath: "/previous.png" });
  assert.deepEqual(media.items[1]!.image, { id: imageRecord.id, imagePath: imageRecord.imagePath });
  assert.equal(media.items[1]!.prompt, "新 Prompt");
  assert.equal(f.snapshot().data.moments!.stable![0]!.author.id, "a");
});

test("Hub失败和关联保存失败保留原图片，取消后迟到结果不关联", async () => {
  const f = fixture();
  f.account("a");
  const id = await f.service.publish({
    text: "",
    media: { type: "images", items: [{ description: "图", prompt: "完整描述" }] },
  });
  f.imageGenerator(async () => {
    throw new Error("Hub失败");
  });
  await assert.rejects(f.service.generateImage(id, 0), /Hub失败/);
  let finish!: (images: readonly (typeof imageRecord)[]) => void;
  f.imageGenerator(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const task = f.service.generateImage(id, 0);
  assert.equal(f.service.generation.busy, true);
  f.service.generation.cancel();
  finish([imageRecord]);
  await assert.rejects(task, { name: "AbortError" });
  assert.equal(f.service.generation.busy, false);
  f.imageGenerator(async () => [imageRecord]);
  f.failSave();
  await assert.rejects(f.service.generateImage(id, 0), /图片已保存在图库/);
  const media = f.snapshot().data.moments!.stable![0]!.media;
  assert.equal(media.type === "images" && media.items[0]!.image, undefined);
});

test("草稿逐图生成只返回所选槽，取消与失败不保存动态", async () => {
  const f = fixture();
  f.account("a");
  const draft = {
    author: { id: "b", name: "同名", scopeId: "stable" },
    text: "待发布",
    media: {
      type: "images" as const,
      items: [
        { description: "第一张", prompt: "第一张Prompt" },
        { description: "第二张", prompt: "第二张Prompt" },
      ],
    },
  };
  f.imageGenerator(async () => [imageRecord, { ...imageRecord, id: "other" }]);
  const generated = await f.service.generateDraftImage(draft, 1);
  assert.equal(generated.description, "第二张");
  assert.equal(generated.image!.id, "hub-first");
  assert.equal(f.snapshot().data.moments, undefined);
  assert.equal("image" in draft.media.items[1]!, false);
  let finish!: (images: readonly (typeof imageRecord)[]) => void;
  f.imageGenerator(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const canceled = assert.rejects(f.service.generateDraftImage(draft, 0), { name: "AbortError" });
  f.service.generation.cancel();
  finish([imageRecord]);
  await canceled;
  assert.equal(f.snapshot().data.moments, undefined);
  f.imageGenerator(async () => {
    throw new Error("Hub失败");
  });
  await assert.rejects(f.service.generateDraftImage(draft, 0), /Hub失败/);
  assert.equal(f.snapshot().data.moments, undefined);
  await assert.rejects(f.service.publish(draft, { ...draft.author, scopeId: "other" }), /草稿作者/);
  const id = await f.service.publish(
    { ...draft, media: { type: "images", items: [draft.media.items[0]!, generated] } },
    draft.author,
  );
  const saved = f.snapshot().data.moments!.stable![0]!;
  assert.equal(saved.id, id);
  assert.equal(saved.author.id, "b");
  assert.equal(saved.media.type === "images" && saved.media.items[1]!.image!.id, "hub-first");
});
