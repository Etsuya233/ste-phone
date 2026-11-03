import assert from "node:assert/strict";
import test from "node:test";
import { emptyWechat, type WechatData, type WechatSnapshot } from "./wechat.ts";
import { normalizeMomentContent, type MomentContent } from "./wechat-moments.ts";
import { validateWechatMoments } from "./wechat-moments-storage.ts";
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
    writeBusy: false,
    barrierSaving: false,
    operationError: null,
  };
  const stored = new Map<string, WechatData>();
  let failSave = false;
  let generating = false;
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
    snapshot: () => snapshot,
    busy: () => writes.busy || generating,
    save: (update, signal) => writes.save(update, signal),
  });
  return {
    service,
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
      media: { type: "images", descriptions: Array(9).fill(" 图片 ") },
    }).media.type,
    "images",
  );
  for (const content of [
    { text: " ", media: { type: "none" } },
    { text: "正文", media: { type: "images", descriptions: [] } },
    { text: "正文", media: { type: "images", descriptions: [" "] } },
    { text: "正文", media: { type: "images", descriptions: Array(10).fill("图片") } },
    { text: "正文", media: { type: "video", description: " " } },
    { text: "正文", media: { type: "audio" } },
  ]) {
    assert.throws(() => normalizeMomentContent(content as MomentContent));
  }
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
    media: { type: "images", descriptions: ["图片"] },
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
