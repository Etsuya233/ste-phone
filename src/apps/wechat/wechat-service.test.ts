import assert from "node:assert/strict";
import test from "node:test";
import { WechatService } from "./wechat-service.ts";
import type { WechatData } from "./wechat.ts";
import type { DataAppPublic, DataSourceSnapshot } from "../data-source/public.ts";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";

function fixture() {
  const people = [
    { id: "a", name: "甲", profileText: "人物甲" },
    { id: "b", name: "乙", profileText: "人物乙" },
  ];
  const context = {
    available: true,
    chatIdentity: "memory-chat",
    scopeId: "instance",
    chatName: "聊天",
    spaceName: "剧情",
    sourceName: "Memory",
    message: null,
  };
  const snapshot: DataSourceSnapshot = {
    context,
    data: null,
    status: "ready",
    sourceId: "ste-memory",
    stale: false,
    error: null,
    loadedAt: null,
    revision: 1,
  };
  const data: DataAppPublic = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    readBackground: async () => ({
      sourceId: "ste-memory",
      scopeId: "instance",
      stableScopeId: "stable",
      characters: people,
      chronicles: [],
      items: [],
    }),
    readSummary: async () => "全部剧情总结",
    readWorldState: async () => [{ worldTime: "2026-11-02", location: "图书馆", weather: "晴" }],
    readRelatedBackground: async (request) => {
      assert.deepEqual([...request.participantIds].sort(), ["a", "b"]);
      return { relationships: [], heldItems: [], importantEvents: [], otherCharacters: [] };
    },
    describe: async () => ({
      sourceId: "ste-memory",
      scopeId: "instance",
      stableScopeId: "stable",
      name: "剧情",
      schemaVersion: 1,
      schemaKey: "schema",
      databaseKey: "db",
      objects: [],
    }),
    query: async () => ({
      rows: [["2026-11-02", "图书馆", "晴"]],
      columns: ["world_time", "current_location", "weather"],
      truncated: false,
      maxRows: 200,
      elapsedMs: 0,
    }),
    readRecentChat: async (request) => {
      assert.equal(request.count, 10);
      return {
        chatIdentity: "memory-chat",
        cleaning: { enabled: false, ruleId: null, ruleName: null },
        messages: [],
      };
    },
  };
  let stored: WechatData | null = null;
  let failSave = false;
  let holdSave = false;
  let saveStarted: (() => void) | null = null;
  let releaseSave: (() => void) | null = null;
  let invalid = false;
  let finishReason = "stop";
  let calls = 0;
  let prompt = "";
  const connection = {
    id: "test",
    name: "模拟",
    model: "model",
    baseUrl: "http://model/v1",
    apiKey: "",
    customHeaders: {},
  };
  const service = new WechatService({
    data,
    chat: { getSnapshot: () => ({ id: "st-chat", name: "聊天" }), subscribe: () => () => {} },
    storage: {
      read: () => stored,
      write: async (_, value) => {
        if (holdSave) {
          holdSave = false;
          saveStarted?.();
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
        }
        if (failSave) {
          throw new Error("磁盘失败");
        }
        stored = structuredClone(value);
      },
    },
    connections: {
      getSnapshot: () => ({ defaultModelConnectionId: "test", connections: [connection] }),
      getConnection: () => connection,
      subscribe: () => () => {},
    },
    transport: createStAiTransport(() => ({}), {
      fetchImpl: async (_, init) => {
        calls++;
        prompt = init!.body as string;
        const content = invalid
          ? "invalid JSON"
          : JSON.stringify({
              messages: [
                { type: "text", text: "一条回复" },
                { type: "text", text: "第二条" },
              ],
            });
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
        );
      },
    }),
  });
  return {
    service,
    data,
    get stored() {
      return stored;
    },
    get calls() {
      return calls;
    },
    get prompt() {
      return prompt;
    },
    failSave(value: boolean) {
      failSave = value;
    },
    holdNextSave() {
      holdSave = true;
      return new Promise<void>((resolve) => {
        saveStarted = resolve;
      });
    },
    releaseSave() {
      releaseSave?.();
      releaseSave = null;
    },
    invalid(value: boolean) {
      invalid = value;
    },
    truncate() {
      finishReason = "length";
    },
  };
}

test("send persists explicit identities and account switch reads the same two-way history", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  let sent = false;
  await f.service.send("b", "你好", () => {
    sent = true;
    assert.equal(f.stored!.conversations[0]!.messages.length, 1);
  });
  assert.equal(sent, true);
  assert.equal(f.service.getConversation("b")!.messages.length, 3);
  assert.deepEqual(
    f.service.getConversation("b")!.messages.map((message) => message.senderId),
    ["a", "b", "b"],
  );
  assert.match(f.prompt, /全部剧情总结/);
  await f.service.selectAccount("b");
  assert.equal(f.service.getConversation("a")!.messages.length, 3);
  await f.service.send("a", "轮到我发言");
  assert.deepEqual(
    f.service
      .getConversation("a")!
      .messages.slice(-3)
      .map((message) => message.senderId),
    ["b", "a", "a"],
  );
  f.service.dispose();
});
test("user message is visible while the chat save is still pending", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const started = f.holdNextSave();
  const sending = f.service.send("b", "你好");
  await started;
  assert.equal(f.service.getConversation("b")!.messages.length, 1);
  assert.equal(f.service.getSnapshot().reply.status, "sending");
  assert.equal(f.service.getDraft("b"), "");
  f.releaseSave();
  assert.equal(await sending, true);
  assert.equal(f.service.getConversation("b")!.messages.length, 3);
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  f.service.dispose();
});
test("invalid generation can retry without appending user message again", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.invalid(true);
  await f.service.send("b", "你好");
  assert.equal(f.service.getSnapshot().reply.status, "error");
  assert.equal(f.service.getConversation("b")!.messages.length, 1);
  f.invalid(false);
  await f.service.retry("b");
  assert.equal(f.service.getConversation("b")!.messages.length, 3);
  assert.equal(f.calls, 2);
  f.service.dispose();
});
test("user persistence failure retains draft and never starts AI", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.service.setDraft("b", "保留输入");
  f.failSave(true);
  assert.equal(await f.service.send("b", "保留输入"), false);
  assert.equal(f.service.getConversation("b"), undefined);
  assert.equal(f.service.getDraft("b"), "保留输入");
  assert.equal(f.calls, 0);
  assert.equal(f.service.getSnapshot().reply.status, "error");
  f.failSave(false);
  await f.service.send("b", "保留输入");
  assert.equal(f.service.getConversation("b")!.messages.length, 3);
  f.service.dispose();
});

test("truncated valid JSON never persists AI messages", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.truncate();
  await f.service.send("b", "你好");
  assert.equal(f.service.getConversation("b")!.messages.length, 1);
  const state = f.service.getSnapshot().reply;
  assert.equal(state.status, "error");
  if (state.status === "error") {
    assert.match(state.error, /输出上限/);
  }
  f.service.dispose();
});
