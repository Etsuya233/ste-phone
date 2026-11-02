import assert from "node:assert/strict";
import test from "node:test";
import { WechatService } from "./wechat-service.ts";
import { WechatStickerLibrary } from "./wechat-sticker-library.ts";
import { pendingWechatMessages } from "./wechat.ts";
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
  const saved = new Map<string, WechatData>();
  let chatId = "st-chat";
  const chatListeners = new Set<() => void>();
  let failSave = false;
  let holdSave = false;
  let saveStarted: (() => void) | null = null;
  let releaseSave: (() => void) | null = null;
  let invalid = false;
  let finishReason = "stop";
  let calls = 0;
  let prompt = "";
  let replySticker = false;
  let releaseModel: (() => void) | null = null;
  let modelStarted: (() => void) | null = null;
  let holdModel = false;
  const stickers = new WechatStickerLibrary({
    read: () => [
      {
        name: "日常",
        enabled: true,
        stickers: [{ label: "开心", description: "开心地挥手", image: "/happy.gif" }],
      },
    ],
    save: () => {},
    upload: async () => "/happy.gif",
    imageUrl: (path) => path,
  });
  const connection = {
    id: "test",
    name: "模拟",
    model: "model",
    baseUrl: "http://model/v1",
    apiKey: "",
    customHeaders: {},
  };
  let sendMode: "immediate" | "delayed" = "immediate";
  const preferences = {
    getSnapshot: () => sendMode,
    subscribe: () => () => {},
    setSendMode: (mode: "immediate" | "delayed") => {
      sendMode = mode;
    },
  };
  const dependencies: ConstructorParameters<typeof WechatService>[0] = {
    preferences,
    stickers,
    data,
    chat: {
      getSnapshot: () => ({ id: chatId, name: "聊天" }),
      subscribe: (listener) => {
        chatListeners.add(listener);
        return () => {
          chatListeners.delete(listener);
        };
      },
    },
    storage: {
      read: (id) => saved.get(id) ?? null,
      write: async (id, value, signal) => {
        const before = saved.get(id);
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
        saved.set(id, stored);
        if (signal?.aborted) {
          stored = before ?? null;
          if (before) {
            saved.set(id, before);
          } else {
            saved.delete(id);
          }
          signal.throwIfAborted();
        }
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
        if (holdModel) {
          holdModel = false;
          modelStarted?.();
          // 故意忽略 signal，验证取消后迟到的上游结果不会落库。
          await new Promise<void>((resolve) => {
            releaseModel = resolve;
          });
        }
        const content = invalid
          ? "invalid JSON"
          : JSON.stringify({
              messages: [
                { type: "text", text: "一条回复" },
                { type: "text", text: replySticker ? "[[sticker:日常:开心]]" : "第二条" },
              ],
            });
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
        );
      },
    }),
  };
  const service = new WechatService(dependencies);
  return {
    service,
    restore: () => new WechatService(dependencies),
    holdModel() {
      holdModel = true;
      return new Promise<void>((resolve) => {
        modelStarted = resolve;
      });
    },
    releaseModel() {
      releaseModel?.();
    },
    preferences,
    stickers,
    data,
    switchChat(id: string) {
      chatId = id;
      for (const listener of chatListeners) {
        listener();
      }
    },
    get stored() {
      return saved.get(chatId) ?? null;
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
    replyWithSticker() {
      replySticker = true;
    },
  };
}

test("send persists explicit identities and account switch reads the same two-way history", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  let sent = false;
  await f.service.send("b", "你好", {
    onSent: () => {
      sent = true;
      assert.equal(f.stored!.conversations[0]!.messages.length, 1);
    },
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

test("panel send and AI reply persist original stickers, preserve draft and exclude disabled packs", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.service.setDraft("b", "稍后发送的文字");
  f.replyWithSticker();
  await f.service.send("b", "[[sticker:日常:开心]]", { preserveDraft: true });
  assert.equal(f.service.getDraft("b"), "稍后发送的文字");
  assert.deepEqual(
    f.stored!.conversations[0]!.messages.map((message) => [message.senderId, message.content.text]),
    [
      ["a", "[[sticker:日常:开心]]"],
      ["b", "一条回复"],
      ["b", "[[sticker:日常:开心]]"],
    ],
  );
  assert.match(f.prompt, /开心地挥手/);
  f.stickers.setEnabled("日常", false);
  await f.service.send("b", "继续聊");
  assert.equal(f.service.getSnapshot().reply.status, "error");
  assert.doesNotMatch(f.prompt, /开心地挥手/);
  assert.equal(f.stored!.conversations[0]!.messages.length, 4);
  f.service.dispose();
});

test("failed panel send leaves text draft untouched and does not request a reply", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.service.setDraft("b", "保留文字");
  f.failSave(true);
  assert.equal(await f.service.send("b", "[[sticker:日常:开心]]", { preserveDraft: true }), false);
  assert.equal(f.service.getDraft("b"), "保留文字");
  assert.equal(f.service.getConversation("b"), undefined);
  assert.equal(f.calls, 0);
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
  await f.service.requestReply("b");
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

test("delayed mode persists text and stickers, restores pending messages and requests one batch", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "第一条");
  f.service.setDraft("b", "未提交的草稿");
  await f.service.enqueue("b", "[[sticker:日常:开心]]", { preserveDraft: true });
  assert.equal(f.calls, 0);
  assert.equal(f.service.getDraft("b"), "未提交的草稿");
  assert.equal(f.stored!.conversations[0]!.messages.length, 2);
  const restored = f.restore();
  await restored.prepare();
  assert.equal(pendingWechatMessages(restored.getConversation("b")!, "a").length, 2);
  await restored.requestReply("b");
  assert.equal(f.calls, 1);
  assert.equal(f.stored!.conversations[0]!.messages.length, 4);
  assert.equal(pendingWechatMessages(restored.getConversation("b")!, "a").length, 0);
  assert.match(f.prompt, /第一条/);
  restored.dispose();
  f.service.dispose();
});

test("mode changes never auto-submit pending messages and failed appends restore their boundary", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "保留的消息");
  const boundary = f.service.getConversation("b")!.pendingReplies!.a;
  f.failSave(true);
  await f.service.enqueue("b", "失败的消息");
  assert.equal(f.service.getConversation("b")!.pendingReplies!.a, boundary);
  assert.equal(pendingWechatMessages(f.service.getConversation("b")!, "a").length, 1);
  f.preferences.setSendMode("immediate");
  assert.equal(f.calls, 0);
  f.failSave(false);
  await f.service.send("b", "立即发送的新消息");
  assert.equal(f.calls, 1);
  assert.match(f.prompt, /保留的消息/);
  f.service.dispose();
});

test("cancel discards a late reply, retains pending messages and permits a new batch", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "第一条");
  const started = f.holdModel();
  const replying = f.service.requestReply("b");
  await started;
  f.service.cancel();
  await f.service.enqueue("b", "补充一条");
  f.releaseModel();
  await replying;
  assert.equal(f.service.getConversation("b")!.messages.length, 2);
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  await f.service.requestReply("b");
  assert.equal(f.service.getConversation("b")!.messages.length, 4);
  assert.equal(f.calls, 2);
  f.service.dispose();
});

test("cancel during reply persistence waits for rollback before releasing the write lock", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "你好");
  const started = f.holdNextSave();
  const replying = f.service.requestReply("b");
  await started;
  f.service.cancel();
  assert.equal(f.service.getSnapshot().reply.status, "stopping");
  await assert.rejects(f.service.enqueue("b", "过早发送"), /等待/);
  f.releaseSave();
  await replying;
  assert.equal(f.stored!.conversations[0]!.messages.length, 1);
  assert.equal(f.service.getConversation("b")!.messages.length, 1);
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  await f.service.requestReply("b");
  assert.equal(f.stored!.conversations[0]!.messages.length, 3);
  f.service.dispose();
});

test("switching accounts cancels the old reply and retains each sender's pending messages", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "甲的消息");
  const started = f.holdModel();
  const replying = f.service.requestReply("b");
  await started;
  await f.service.selectAccount("b");
  await f.service.enqueue("a", "乙的消息");
  f.releaseModel();
  await replying;
  assert.equal(f.service.getSnapshot().data.account!.id, "b");
  assert.equal(f.service.getConversation("a")!.messages.length, 2);
  assert.equal(pendingWechatMessages(f.service.getConversation("a")!, "a").length, 1);
  assert.equal(pendingWechatMessages(f.service.getConversation("a")!, "b").length, 1);
  f.service.dispose();
});

test("late results cannot overwrite a chat after switching away and back", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "原聊天消息");
  const started = f.holdModel();
  const replying = f.service.requestReply("b");
  await started;
  f.switchChat("another-chat");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "其他聊天消息");
  f.switchChat("st-chat");
  await f.service.prepare();
  f.releaseModel();
  await replying;
  assert.deepEqual(
    f.service.getConversation("b")!.messages.map((message) => message.content.text),
    ["原聊天消息"],
  );
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  f.service.dispose();
});

test("quitting during a failed user save restores the message and leaves a usable pending boundary", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "已保存");
  const started = f.holdNextSave();
  const sending = f.service.enqueue("b", "保存失败的正文");
  await started;
  f.service.cancel();
  f.failSave(true);
  f.releaseSave();
  assert.equal(await sending, false);
  assert.equal(f.service.getDraft("b"), "保存失败的正文");
  assert.deepEqual(
    pendingWechatMessages(f.service.getConversation("b")!, "a").map(
      (message) => message.content.text,
    ),
    ["已保存"],
  );
  assert.equal(f.service.getSnapshot().reply.status, "error");
  f.service.dispose();
});

test("send submits pending messages with the current text and empty send starts a proactive reply", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "排队的消息");
  await f.service.send("b", "当前输入框的消息");
  assert.equal(f.calls, 1);
  assert.deepEqual(
    f.stored!.conversations[0]!.messages.slice(0, 2).map((message) => message.content.text),
    ["排队的消息", "当前输入框的消息"],
  );
  const before = f.stored!.conversations[0]!.messages.length;
  await f.service.send("b", "");
  assert.equal(f.calls, 2);
  assert.equal(f.stored!.conversations[0]!.messages.length, before + 2);
  const request = JSON.parse(f.prompt) as { messages: { role: string; content: string }[] };
  const payload = JSON.parse(
    request.messages.findLast((message) => message.role === "user")!.content,
  );
  assert.equal(payload.本轮任务, "主动发起聊天");
  f.service.dispose();
});

test("empty send can open a new conversation without a blank user message or trigger id", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.send("b", "   ");
  const messages = f.stored!.conversations[0]!.messages;
  assert.equal(messages.length, 2);
  assert.ok(
    messages.every(
      (message) =>
        message.senderId === "b" && message.reply && message.reply.triggerMessageId === undefined,
    ),
  );
  assert.equal(pendingWechatMessages(f.service.getConversation("b")!, "a").length, 0);
  f.service.dispose();
});

test("a user save completed after switching away and back remains in the active conversation", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  const started = f.holdNextSave();
  const sending = f.service.enqueue("b", "切换期间保存的消息");
  await started;
  f.switchChat("another-chat");
  f.switchChat("st-chat");
  await f.service.prepare();
  f.releaseSave();
  assert.equal(await sending, true);
  assert.equal(f.service.getConversation("b")!.messages[0]!.content.text, "切换期间保存的消息");
  assert.equal(f.calls, 0);
  await f.service.enqueue("b", "下一条消息");
  assert.equal(f.stored!.conversations[0]!.messages.length, 2);
  f.service.dispose();
});
