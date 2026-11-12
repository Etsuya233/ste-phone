import assert from "node:assert/strict";
import test from "node:test";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";
import type { PhoneChat } from "../../core/chat/public.ts";
import type { DataAppPublic, DataSourceSnapshot } from "../data-source/public.ts";
import { createCampusPost, emptyCampus, type CampusData } from "./campus-domain.ts";
import { CampusService } from "./campus-service.ts";

const connection = {
  id: "model",
  name: "校园模型",
  model: "preview",
  baseUrl: "http://localhost/v1",
  apiKey: "",
  customHeaders: {},
};

function response() {
  const output = JSON.stringify({
    people: [{ key: "new:1", nickname: "路过的同学", bio: "", style: "", profile: "高二学生" }],
    posts: [
      {
        authorId: "new:1",
        text: "图书馆最近很热闹。",
        images: [],
        backgroundLikes: 0,
        backgroundComments: 0,
      },
    ],
  });
  const event = (delta: unknown, finish_reason: string | null) =>
    `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;
  return new Response(event({ content: output }, null) + event({}, "stop") + "data: [DONE]\n\n");
}

function fixture() {
  const key = (chat: string, space: string) => JSON.stringify([chat, space]);
  const space = JSON.stringify(["memory", "stable"]);
  const saved = new Map<string, CampusData>();
  const writes: { chat: string; space: string; data: CampusData }[] = [];
  let write = async () => {};
  let fetchModel = async () => response();
  let modelCalls = 0;
  let current: PhoneChat = { id: "A", name: "A" };
  let chatChanged = () => {};
  let sourceChanged = () => {};
  let stableScopeId = "stable";
  let queryAuthors = async () => [["red", "小红"]];
  let source: DataSourceSnapshot = {
    sourceId: "memory",
    context: {
      sourceName: "Memory",
      chatIdentity: "memory-chat",
      chatName: "校园",
      scopeId: "instance",
      spaceName: "校园",
      available: true,
      message: null,
    },
    status: "idle",
    data: null,
    stale: false,
    error: null,
    loadedAt: null,
    revision: 0,
  };
  const data = {
    getSnapshot: () => source,
    subscribe: (listener: () => void) => {
      sourceChanged = listener;
      return () => {};
    },
    describe: async () => ({ sourceId: "memory", stableScopeId }),
    query: async () => ({ rows: await queryAuthors(), truncated: false }),
    readBackground: async () => ({ characters: [] }),
    readSummary: async () => "",
    readWorldState: async () => [],
    readRecentChat: async () => ({ messages: [] }),
  } as unknown as DataAppPublic;
  const service = new CampusService({
    chat: {
      getSnapshot: () => current,
      subscribe: (listener) => {
        chatChanged = listener;
        return () => {};
      },
    },
    data,
    imageHub: { listImages: async () => [], generate: async () => [] },
    connections: {
      getSnapshot: () => ({ connections: [connection], defaultModelConnectionId: "model" }),
      subscribe: () => () => {},
      getConnection: () => connection,
    },
    transport: createStAiTransport(() => ({}), {
      log() {},
      fetchImpl: async () => {
        modelCalls++;
        return fetchModel();
      },
    }),
    storage: {
      read: (chat, space) => saved.get(key(chat, space)) ?? emptyCampus(),
      async write(chat, space, data) {
        writes.push({ chat, space, data });
        await write();
        saved.set(key(chat, space), structuredClone(data));
      },
    },
  });
  service.open();
  return {
    service,
    writes,
    modelCalls: () => modelCalls,
    saveWith(handler: typeof write) {
      write = handler;
    },
    modelWith(handler: typeof fetchModel) {
      fetchModel = handler;
    },
    authorsWith(handler: typeof queryAuthors) {
      queryAuthors = handler;
      source = { ...source, revision: source.revision + 1 };
      sourceChanged();
    },
    switchChat(id: string) {
      current = { id, name: id };
      chatChanged();
    },
    rebuildSpace(id: string) {
      stableScopeId = id;
      source = { ...source, revision: source.revision + 1 };
      sourceChanged();
    },
    saved: (chat: string) => saved.get(key(chat, space)),
  };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function waitForPhase(
  service: CampusService,
  phase: ReturnType<CampusService["getSnapshot"]>["phase"],
) {
  return new Promise<void>((resolve) => {
    if (service.getSnapshot().phase === phase) {
      resolve();
      return;
    }
    const unsubscribe = service.subscribe(() => {
      if (service.getSnapshot().phase === phase) {
        unsubscribe();
        resolve();
      }
    });
  });
}

test("保存失败保留完整批次，切换聊天后须返回原范围重试且不再调用模型", async () => {
  const f = fixture();
  const { service } = f;
  await tick();
  f.saveWith(async () => {
    throw new Error("磁盘写入失败");
  });
  const id = service.start([], "", null);
  await waitForPhase(service, "unsaved");
  assert.equal(service.getSnapshot().phase, "unsaved");
  assert.equal(service.getSnapshot().data.posts.length, 0);
  assert.equal(service.canQuit(), false);
  f.switchChat("B");
  await tick();
  assert.equal(service.getSnapshot().canRetry, false);
  service.retry();
  assert.equal(f.writes.length, 1);
  f.switchChat("A");
  await tick();
  assert.equal(service.getSnapshot().canRetry, true);
  f.saveWith(async () => {});
  service.retry();
  await tick();
  assert.equal(service.getSnapshot().phase, "idle");
  assert.equal(service.canQuit(), true);
  assert.equal(service.getSnapshot().completedBatchId, id);
  assert.deepEqual(f.writes[0], f.writes[1]);
  assert.equal(f.modelCalls(), 1);
  assert.equal(f.saved("A")?.people.length, 1);
  assert.equal(f.saved("A")?.posts.length, 1);
  assert.equal(f.saved("B"), undefined);
});

test("保存完成后记录本批新帖定位，清除后不再提示", async () => {
  const f = fixture();
  await tick();
  f.service.start([], "", null);
  await waitForPhase(f.service, "idle");
  const saved = f.service.getSnapshot().lastSaved!;
  assert.equal(saved.targetPostId, null);
  assert.equal(saved.postIds.length, 1);
  assert.equal(saved.commentIds.length, 0);
  assert.equal(
    f.saved("A")?.posts.some(({ id }) => id === saved.postIds[0]),
    true,
  );
  assert.equal(f.service.getSnapshot().revealedBatchId, null);
  f.service.markSavedRevealed(saved.batchId);
  assert.equal(f.service.getSnapshot().revealedBatchId, saved.batchId);
  f.service.clearSaved();
  assert.equal(f.service.getSnapshot().lastSaved, null);
  assert.equal(f.service.getSnapshot().revealedBatchId, null);
});

test("手动发布和评论只记录本次新内容，不写回持久数据", async () => {
  const f = fixture();
  await tick();
  const created = await f.service.command({
    type: "create-accounts",
    authorIds: ["red"],
    scopeKey: f.service.getSnapshot().scopeKey!,
  });
  assert.equal(created, true);
  const authorId = f.service.getSnapshot().data.accounts[0]!.id;
  const post = createCampusPost({
    id: "manual-post",
    authorId,
    text: "手动帖子",
    images: [],
    backgroundLikes: 0,
    backgroundComments: 0,
  });
  assert.equal(await f.service.command({ type: "publish", post }), true);
  assert.equal(f.service.getSnapshot().lastSaved?.kind, "published");
  assert.deepEqual(f.service.getSnapshot().lastSaved?.postIds, ["manual-post"]);
  const comment = {
    id: "manual-comment",
    authorId,
    text: "手动评论",
    replyTo: null,
    deleted: false,
  };
  assert.equal(await f.service.command({ type: "comment", postId: "manual-post", comment }), true);
  assert.equal(f.service.getSnapshot().lastSaved?.kind, "commented");
  assert.deepEqual(f.service.getSnapshot().lastSaved?.commentIds, ["manual-comment"]);
  assert.equal(f.saved("A")?.posts[0]?.comments[0]?.createdAt !== undefined, true);
});

test("同一实例重设稳定资料范围时取消未保存的生成", async () => {
  const f = fixture();
  const { service } = f;
  await tick();
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<Response>();
  f.modelWith(async () => {
    entered.resolve();
    return pending.promise;
  });
  service.start([], "", null);
  await entered.promise;
  f.rebuildSpace("replacement");
  await tick();
  assert.equal(service.getSnapshot().phase, "idle");
  pending.resolve(response());
  await tick();
  assert.equal(f.writes.length, 0);
  assert.equal(service.getSnapshot().data.posts.length, 0);
});

test("进入保存后切聊天，完整批次只进入原聊天", async () => {
  const f = fixture();
  const { service } = f;
  await tick();
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  f.saveWith(async () => {
    entered.resolve();
    return pending.promise;
  });
  service.start([], "", null);
  await entered.promise;
  assert.equal(service.getSnapshot().phase, "saving");
  f.switchChat("B");
  await tick();
  pending.resolve();
  await waitForPhase(service, "idle");
  assert.equal(f.saved("A")?.posts.length, 1);
  assert.equal(service.getSnapshot().data.posts.length, 0);
  assert.equal(f.saved("B"), undefined);
});

test("批量创建一次保存，失败数据不变，重试后恢复且重复命令不写入", async () => {
  const f = fixture();
  await tick();
  const before = f.service.getSnapshot().data;
  const command = {
    type: "create-accounts" as const,
    authorIds: ["red"],
    scopeKey: f.service.getSnapshot().scopeKey!,
  };
  f.saveWith(async () => {
    throw new Error("保存失败");
  });
  assert.equal(await f.service.command(command), false);
  assert.equal(f.service.getSnapshot().data, before);
  assert.match(f.service.getSnapshot().error!, /保存失败/);
  f.saveWith(async () => {});
  assert.equal(await f.service.command(command), true);
  assert.equal(f.writes.length, 2);
  assert.equal(f.service.getSnapshot().data.accounts[0]!.nickname, "小红");
  assert.equal(await f.service.command(command), true);
  assert.equal(f.writes.length, 2);
  f.service.quit();
  f.service.open();
  await tick();
  assert.equal(f.service.getSnapshot().data.accounts.length, 1);
});

test("人物刷新完成前禁止批量创建，完成后拒绝已移除人物与旧范围选择", async () => {
  const f = fixture();
  await tick();
  const command = {
    type: "create-accounts" as const,
    authorIds: ["red"],
    scopeKey: f.service.getSnapshot().scopeKey!,
  };
  const pending = Promise.withResolvers<string[][]>();
  f.authorsWith(() => pending.promise);
  await tick();
  assert.equal(f.service.getSnapshot().authorsReady, false);
  assert.equal(await f.service.command(command), false);
  assert.equal(f.writes.length, 0);
  pending.resolve([["blue", "小蓝"]]);
  await tick();
  assert.equal(f.service.getSnapshot().authorsReady, true);
  assert.equal(await f.service.command(command), false);
  assert.match(f.service.getSnapshot().error!, /当前资料/);
  f.switchChat("B");
  await tick();
  assert.equal(await f.service.command({ ...command, authorIds: ["blue"] }), false);
  assert.match(f.service.getSnapshot().error!, /范围已变化/);
  assert.equal(f.writes.length, 0);
});

test("批量保存锁定原聊天，阻止重复提交且切聊天后不污染新范围", async () => {
  const f = fixture();
  await tick();
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  f.saveWith(async () => {
    entered.resolve();
    return pending.promise;
  });
  const command = {
    type: "create-accounts" as const,
    authorIds: ["red"],
    scopeKey: f.service.getSnapshot().scopeKey!,
  };
  const saving = f.service.command(command);
  await entered.promise;
  assert.equal(f.service.getSnapshot().phase, "saving");
  assert.equal(await f.service.command(command), false);
  f.switchChat("B");
  await tick();
  pending.resolve();
  assert.equal(await saving, true);
  assert.equal(f.saved("A")!.accounts.length, 1);
  assert.equal(f.saved("B"), undefined);
  assert.equal(f.service.getSnapshot().data.accounts.length, 0);
});
