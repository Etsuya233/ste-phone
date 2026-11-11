import assert from "node:assert/strict";
import test from "node:test";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";
import type { PhoneChat } from "../../core/chat/public.ts";
import type { DataAppPublic, DataSourceSnapshot } from "../data-source/public.ts";
import { emptyCampus, type CampusData } from "./campus-domain.ts";
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
    posts: [{ authorId: "new:1", text: "图书馆最近很热闹。", images: [], popular: false }],
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
    query: async () => ({ rows: [["red", "小红"]], truncated: false }),
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
