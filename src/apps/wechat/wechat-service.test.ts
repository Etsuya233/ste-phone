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
  let stableScopeId = "stable";
  const context = {
    available: true,
    chatIdentity: "memory-chat",
    scopeId: "instance",
    chatName: "聊天",
    spaceName: "剧情",
    sourceName: "Memory",
    message: null,
  };
  let snapshot: DataSourceSnapshot = {
    context,
    data: null,
    status: "ready",
    sourceId: "ste-memory",
    stale: false,
    error: null,
    loadedAt: null,
    revision: 1,
  };
  const sourceListeners = new Set<() => void>();
  const data: DataAppPublic = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      sourceListeners.add(listener);
      return () => {
        sourceListeners.delete(listener);
      };
    },
    readBackground: async () => ({
      sourceId: "ste-memory",
      scopeId: "instance",
      stableScopeId,
      characters: people,
      chronicles: [],
      items: [],
    }),
    readSummary: async () => "全部剧情总结",
    readWorldState: async () => [{ worldTime: "2026-11-02", location: "图书馆", weather: "晴" }],
    readRelatedBackground: async (request) => {
      assert.ok(
        request.participantIds.length >= 1 &&
          request.participantIds.every((id) => ["a", "b"].includes(id)),
      );
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
  let momentOutput: string | null = null;
  let defaultModelId: string | null = "test";
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
  let historyMessageLimit = 100;
  const preferences = {
    getHistoryMessageLimit: () => historyMessageLimit,
    setHistoryMessageLimit: (limit: number) => {
      historyMessageLimit = limit;
    },
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
        signal?.throwIfAborted();
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
      },
    },
    connections: {
      getSnapshot: () => ({ defaultModelConnectionId: defaultModelId, connections: [connection] }),
      getConnection: () => connection,
      subscribe: () => () => {},
    },
    imageHub: {
      listImages: async () => [],
      generate: async ({ prompt }) => [
        {
          id: "hub-image",
          imagePath: "/image.png",
          prompt,
          startedAt: "2026-11-04T00:00:00Z",
          savedAt: "2026-11-04T00:00:01Z",
        },
      ],
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
          : (momentOutput ??
            JSON.stringify({
              messages: [
                { type: "text", text: "一条回复" },
                { type: "text", text: replySticker ? "[[sticker:日常:开心]]" : "第二条" },
              ],
            }));
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
    setScope(id: string) {
      stableScopeId = id;
    },
    sourceChanged(available: boolean, scopeId: string) {
      context.available = available;
      context.scopeId = scopeId;
      snapshot = { ...snapshot, revision: snapshot.revision + 1 };
      for (const listener of sourceListeners) {
        listener();
      }
    },
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
    momentOutput(value: unknown) {
      momentOutput = JSON.stringify(value);
    },
    withoutDefaultConnection() {
      defaultModelId = null;
    },
    addPerson(id: string) {
      people.push({ id, name: `人物${id}`, profileText: `完整${id}资料` });
    },
    removePerson(id: string) {
      people.splice(
        people.findIndex((person) => person.id === id),
        1,
      );
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

test("a reply already saving commits despite stop and retains the write lock until confirmation", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "你好");
  const started = f.holdNextSave();
  const replying = f.service.requestReply("b");
  await started;
  f.service.cancel();
  assert.equal(f.service.getSnapshot().reply.status, "saving");
  await assert.rejects(f.service.enqueue("b", "过早发送"), /等待/);
  f.releaseSave();
  await replying;
  assert.equal(f.stored!.conversations[0]!.messages.length, 3);
  assert.equal(f.service.getConversation("b")!.messages.length, 3);
  assert.deepEqual(pendingWechatMessages(f.service.getConversation("b")!, "a"), []);
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  await f.service.enqueue("b", "保存后发送");
  f.service.dispose();
});

test("switching chats during a reply write isolates the old result and keeps confirmed data", async () => {
  for (const fail of [false, true]) {
    const f = fixture();
    await f.service.prepare();
    await f.service.selectAccount("a");
    const started = f.holdNextSave();
    const reply = f.service.requestReply("b");
    await started;
    f.switchChat("another-chat");
    assert.equal(f.service.getSnapshot().reply.status, "idle");
    assert.equal(f.service.getSnapshot().writeBusy, true);
    f.failSave(fail);
    f.releaseSave();
    await reply;
    assert.equal(f.service.getSnapshot().reply.status, "idle");
    assert.equal(f.service.getSnapshot().writeBusy, false);
    assert.deepEqual(f.service.getSnapshot().data.conversations, []);
    f.switchChat("st-chat");
    await f.service.prepare();
    assert.equal(f.service.getConversation("b")?.messages.length, fail ? undefined : 2);
    f.service.dispose();
  }
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

test("reply guidance belongs to stable people in one ST chat and survives restore and account changes", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  assert.equal(Object.hasOwn(f.stored!, "replyGuidance"), false); // 已有 v1 数据可直接编辑，无需重写历史。
  await f.service.saveReplyGuidance("a", "甲的指导");
  await f.service.saveReplyGuidance("b", "  乙的指导\n多用 Emoji  ");
  assert.deepEqual(f.stored!.replyGuidance, {
    stable: { a: "甲的指导", b: "乙的指导\n多用 Emoji" },
  });
  const restored = f.restore();
  await restored.prepare();
  await restored.selectAccount("b");
  assert.deepEqual(restored.getSnapshot().data.replyGuidance, f.stored!.replyGuidance);
  restored.dispose();
  f.switchChat("other-chat");
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().data.replyGuidance, undefined);
  await f.service.saveReplyGuidance("b", "另一聊天的指导");
  f.switchChat("st-chat");
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().data.replyGuidance!.stable!.b, "乙的指导\n多用 Emoji");
  f.setScope("other-stable-scope");
  await f.service.prepare();
  await f.service.saveReplyGuidance("b", "另一空间的指导");
  const guidance = f.service.getSnapshot().data.replyGuidance!;
  assert.equal(guidance.stable!.b, "乙的指导\n多用 Emoji");
  assert.equal(guidance["other-stable-scope"]!.b, "另一空间的指导");
  f.service.dispose();
});

test("only the reply person's guidance enters system instructions, and clearing restores the default", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.saveReplyGuidance("a", "甲专用的傲娇指导");
  await f.service.saveReplyGuidance("b", "乙专用的 Emoji 指导");
  await f.service.send("b", "");
  let request = JSON.parse(f.prompt);
  let system = request.messages.filter((message: { role: string }) => message.role === "system");
  assert.match(JSON.stringify(system), /乙专用的 Emoji 指导/);
  assert.doesNotMatch(JSON.stringify(system), /甲专用的傲娇指导/);
  assert.match(JSON.stringify(system), /指导不改变剧情事实/);
  assert.doesNotMatch(
    JSON.stringify(request.messages.filter((message: { role: string }) => message.role === "user")),
    /乙专用的 Emoji 指导/,
  );
  await f.service.selectAccount("b");
  await f.service.send("a", "换个视角");
  assert.match(f.prompt, /甲专用的傲娇指导/);
  assert.doesNotMatch(f.prompt, /乙专用的 Emoji 指导/);
  await f.service.saveReplyGuidance("a", " \n ");
  await f.service.send("a", "继续");
  request = JSON.parse(f.prompt);
  system = request.messages.filter((message: { role: string }) => message.role === "system");
  assert.doesNotMatch(JSON.stringify(system), /甲专用的傲娇指导|用户为当前回复人物设置/);
  assert.equal(f.stored!.replyGuidance!.stable!.a, undefined);
  f.service.dispose();
});

test("guidance is fixed before background reads and edits apply to the next generation and retry", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.saveReplyGuidance("b", "原本的指导");
  const readSummary = f.data.readSummary;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.data.readSummary = async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return "全部剧情总结";
  };
  const replying = f.service.requestReply("b");
  await waiting;
  await f.service.saveReplyGuidance("b", "修改后的指导");
  release();
  await replying;
  assert.match(f.prompt, /原本的指导/);
  assert.doesNotMatch(f.prompt, /修改后的指导/);
  assert.equal(f.stored!.replyGuidance!.stable!.b, "修改后的指导");
  assert.equal(f.stored!.conversations[0]!.messages.length, 2);
  f.data.readSummary = readSummary;
  f.invalid(true);
  await f.service.send("b", "触发失败");
  assert.match(f.prompt, /修改后的指导/);
  await f.service.saveReplyGuidance("b", "重试的新指导");
  f.invalid(false);
  await f.service.requestReply("b");
  assert.match(f.prompt, /重试的新指导/);
  assert.doesNotMatch(f.prompt, /修改后的指导/);
  assert.equal(f.stored!.conversations[0]!.messages.length, 5);
  f.service.dispose();
});

test("reply completion waits for a guidance write and preserves both changes", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const modelStarted = f.holdModel();
  const replying = f.service.requestReply("b");
  await modelStarted;
  const saveStarted = f.holdNextSave();
  const saving = f.service.saveReplyGuidance("b", "生成期间的新指导");
  await saveStarted;
  f.releaseModel();
  f.releaseSave();
  await Promise.all([saving, replying]);
  assert.equal(f.stored!.replyGuidance!.stable!.b, "生成期间的新指导");
  assert.equal(f.stored!.conversations[0]!.messages.length, 2);
  f.service.dispose();
});

test("a generated reply waiting behind a guidance write can still be canceled", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const modelStarted = f.holdModel();
  const reply = f.service.requestReply("b");
  await modelStarted;
  const saveStarted = f.holdNextSave();
  const guidance = f.service.saveReplyGuidance("b", "保存指导");
  await saveStarted;
  const replyQueued = new Promise<void>((resolve) => {
    const unsubscribe = f.service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
  f.releaseModel();
  await replyQueued;
  assert.equal(f.service.getSnapshot().reply.status, "running");
  f.service.cancel();
  f.releaseSave();
  await Promise.all([guidance, reply]);
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  assert.deepEqual(f.stored!.conversations, []);
  assert.equal(f.stored!.replyGuidance!.stable!.b, "保存指导");
  f.service.dispose();
});

test("a guidance save queued behind a reply keeps the confirmed reply", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const started = f.holdNextSave();
  const replying = f.service.requestReply("b");
  await started;
  const saving = f.service.saveReplyGuidance("b", "保留新指导");
  f.service.cancel();
  f.releaseSave();
  await Promise.all([saving, replying]);
  assert.equal(f.stored!.replyGuidance!.stable!.b, "保留新指导");
  assert.equal(f.stored!.conversations[0]!.messages.length, 2);
  f.service.dispose();
});

test("failed guidance writes retain saved data, allow retry and never write into a switched chat", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.saveReplyGuidance("b", "已保存指导");
  f.failSave(true);
  await assert.rejects(f.service.saveReplyGuidance("b", "失败的修改"), /磁盘失败/);
  assert.equal(f.service.getSnapshot().data.replyGuidance!.stable!.b, "已保存指导");
  f.failSave(false);
  const started = f.holdNextSave();
  const saving = f.service.saveReplyGuidance("b", "原聊天的修改");
  await started;
  const queued = f.service.saveReplyGuidance("a", "排队期间换聊天");
  f.switchChat("other-chat");
  f.releaseSave();
  await saving;
  await assert.rejects(queued, /聊天已变化/);
  assert.equal(f.service.getSnapshot().data.replyGuidance, undefined);
  assert.equal(f.stored, null);
  f.switchChat("st-chat");
  assert.equal(f.service.getSnapshot().data.replyGuidance!.stable!.b, "原聊天的修改");
  f.service.dispose();
});

function latestPayload(prompt: string) {
  const request = JSON.parse(prompt) as { messages: { role: string; content: string }[] };
  return JSON.parse(request.messages.findLast((message) => message.role === "user")!.content);
}

test("barriers survive empty conversations, failed first sends and account switches", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.memory.insert("b", null);
  assert.ok(id);
  assert.equal(await f.service.memory.insert("b", null), id);
  assert.equal(f.service.getConversation("b")!.memoryBarriers!.length, 1);
  f.failSave(true);
  assert.equal(await f.service.enqueue("b", "失败的第一条"), false);
  assert.deepEqual(f.service.getConversation("b")!.messages, []);
  assert.equal(f.service.getConversation("b")!.memoryBarriers![0]!.id, id);
  f.failSave(false);
  await f.service.selectAccount("b");
  assert.equal(f.service.getConversation("a")!.memoryBarriers![0]!.id, id);
  const restored = f.restore();
  await restored.prepare();
  assert.equal(restored.getConversation("a")!.memoryBarriers![0]!.id, id);
  restored.dispose();
  f.service.dispose();
});

test("cross-barrier queues reply only to visible messages and consume original queue on success", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "隐藏的旧队列");
  const hidden = f.service.getConversation("b")!.messages[0]!;
  const barrier = await f.service.memory.insert("b", hidden.id);
  await f.service.enqueue("b", "获准的新输入");
  const visible = f.service.getConversation("b")!.messages.at(-1)!;
  f.invalid(true);
  await f.service.requestReply("b");
  assert.equal(pendingWechatMessages(f.service.getConversation("b")!, "a").length, 2);
  assert.doesNotMatch(f.prompt, /隐藏的旧队列/);
  f.invalid(false);
  await f.service.requestReply("b");
  const completed = f.service.getConversation("b")!;
  assert.equal(completed.pendingCompletedThrough!.a, visible.id);
  assert.equal(completed.messages.at(-1)!.reply!.triggerMessageId, visible.id);
  await f.service.memory.setEnabled("b", barrier!, false);
  await f.service.requestReply("b");
  assert.equal(latestPayload(f.prompt).本轮任务, "主动发起聊天");
  assert.deepEqual(pendingWechatMessages(f.service.getConversation("b")!, "a"), []);
  f.service.dispose();
});

test("fully hidden queues produce proactive replies with no fake trigger and never revive", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "旧队列");
  const hidden = f.service.getConversation("b")!.messages[0]!;
  const barrier = await f.service.memory.insert("b", hidden.id);
  await f.service.requestReply("b");
  assert.equal(latestPayload(f.prompt).本轮任务, "主动发起聊天");
  assert.deepEqual(latestPayload(f.prompt).本轮输入, []);
  const completed = f.service.getConversation("b")!;
  assert.equal(completed.pendingCompletedThrough!.a, hidden.id);
  assert.equal(completed.messages.at(-1)!.reply!.triggerMessageId, undefined);
  await f.service.memory.setEnabled("b", barrier!, false);
  assert.deepEqual(pendingWechatMessages(f.service.getConversation("b")!, "a"), []);
  f.service.dispose();
});

test("barrier saves are globally exclusive and failures preserve original barriers and drafts", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.service.setDraft("b", "保留草稿");
  const started = f.holdNextSave();
  const inserting = f.service.memory.insert("b", null);
  await started;
  assert.equal(f.service.getSnapshot().barrierSaving, true);
  await assert.rejects(f.service.send("b", "新消息"), /等待/);
  await assert.rejects(f.service.enqueue("b", "队列"), /延迟|等待/);
  await assert.rejects(f.service.selectAccount("b"), /等待/);
  await assert.rejects(f.service.memory.insert("b", null), /回复或保存/);
  f.failSave(true);
  f.releaseSave();
  assert.equal(await inserting, null);
  assert.equal(f.service.getConversation("b"), undefined);
  assert.equal(f.service.getDraft("b"), "保留草稿");
  assert.match(f.service.getSnapshot().operationError!, /聊天.*甲.*乙.*磁盘失败/);
  f.failSave(false);
  f.service.dismissOperationError();
  assert.ok(await f.service.memory.insert("b", null));
  const modelStarted = f.holdModel();
  const replying = f.service.requestReply("b");
  await modelStarted;
  await assert.rejects(
    f.service.memory.delete("b", f.service.getConversation("b")!.memoryBarriers![0]!.id),
    /回复或保存/,
  );
  f.service.cancel();
  f.releaseModel();
  await replying;
  assert.ok(await f.service.memory.insert("b", null));
  f.service.dispose();
});

test("history limit is fixed before async background reads and retries read the new setting", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.send("b", "初次消息");
  f.preferences.setHistoryMessageLimit(1);
  const read = f.data.readSummary;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.data.readSummary = async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return "背景";
  };
  const replying = f.service.requestReply("b");
  await waiting;
  f.preferences.setHistoryMessageLimit(100);
  release();
  await replying;
  assert.equal(latestPayload(f.prompt).当前微信历史.length, 1);
  f.data.readSummary = read;
  await f.service.requestReply("b");
  assert.equal(latestPayload(f.prompt).当前微信历史.length, 5);
  f.service.dispose();
});

test("barrier writes retain their old target lock and errors after switching chats", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const started = f.holdNextSave();
  const inserting = f.service.memory.insert("b", null);
  await started;
  f.switchChat("other-chat");
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().barrierSaving, true);
  await assert.rejects(f.service.selectAccount("a"), /等待/);
  f.failSave(true);
  f.releaseSave();
  await inserting;
  assert.equal(f.service.getSnapshot().data.conversations.length, 0);
  assert.match(f.service.getSnapshot().operationError!, /甲.*乙/);
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  f.service.dispose();
});

test("a switched user save releases the global sending state and a reloaded barrier reads confirmed data", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  const started = f.holdNextSave();
  const sending = f.service.enqueue("b", "旧聊天的消息");
  await started;
  f.switchChat("another-chat");
  f.releaseSave();
  await sending;
  assert.equal(f.service.getSnapshot().reply.status, "idle");
  assert.equal(f.service.getSnapshot().writeBusy, false);
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "新聊天可继续发送");
  f.switchChat("st-chat");
  await f.service.prepare();
  const savingStarted = f.holdNextSave();
  const inserting = f.service.memory.insert("b", null);
  await savingStarted;
  f.switchChat("another-chat");
  f.switchChat("st-chat");
  await f.service.prepare();
  assert.equal(f.service.getConversation("b")!.memoryBarriers, undefined);
  f.releaseSave();
  const barrierId = await inserting;
  assert.equal(f.service.getConversation("b")!.memoryBarriers![0]!.id, barrierId);
  await f.service.enqueue("b", "重新载入后继续");
  assert.equal(f.stored!.conversations[0]!.messages.length, 2);
  assert.equal(f.stored!.conversations[0]!.memoryBarriers![0]!.id, barrierId);
  f.service.dispose();
});

test("朋友圈阅读范围在来源断开后保留，新实例与新聊天不沿用旧范围", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.moments.publish({ text: "保存的动态", media: [] });
  f.sourceChanged(false, "");
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().momentsScopeId, "stable");
  assert.equal(f.service.getSnapshot().scopeId, null);
  assert.equal(f.service.getSnapshot().data.moments!.stable![0]!.text, "保存的动态");
  await assert.rejects(f.service.moments.publish({ text: "断开时发布", media: [] }), /资料不可用/);
  const restored = f.restore();
  assert.equal(restored.getSnapshot().momentsScopeId, null);
  assert.deepEqual(Object.keys(restored.getSnapshot().data.moments!), ["stable"]);
  restored.dispose();
  f.setScope("new-stable");
  f.sourceChanged(true, "new-instance");
  assert.equal(f.service.getSnapshot().momentsScopeId, null);
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().momentsScopeId, "new-stable");
  assert.equal(f.service.getSnapshot().data.account, null);
  f.switchChat("new-chat");
  assert.equal(f.service.getSnapshot().momentsScopeId, null);
  assert.equal(f.service.getSnapshot().data.moments, undefined);
  f.service.dispose();
});

test("朋友圈AI显式选择人物发布，互动排除当前帐号且支持整批前序回复", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.saveReplyGuidance("b", "乙的公开表达");
  f.momentOutput({
    authorId: "b",
    text: "乙的动态",
    media: [{ type: "video", description: "视频内容" }],
  });
  const draft = await f.service.moments.generatePost("b", "  分享逛街日常，配两张图  ");
  assert.equal(f.stored!.moments, undefined);
  await f.service.moments.publish(draft, draft.author);
  const post = f.stored!.moments!.stable![0]!;
  assert.equal(post.author.id, "b");
  assert.equal(f.service.getSnapshot().momentGeneration.status, "complete");
  let request = JSON.parse(f.prompt) as { messages: { role: string; content: string }[] };
  assert.match(request.messages[0]!.content, /乙的公开表达/);
  assert.match(request.messages[0]!.content, /本次用户指引："分享逛街日常，配两张图"/);
  assert.match(request.messages[0]!.content, /不改变人物资料、知情范围、允许参与人物/);
  assert.doesNotMatch(JSON.stringify(f.stored), /分享逛街日常/);
  assert.equal(JSON.parse(request.messages[1]!.content).author.id, "b");
  assert.deepEqual(f.stored!.conversations, []);
  f.momentOutput({
    comments: [
      { authorId: "b", text: "跟进", replyTo: null },
      { authorId: "b", text: "补充", replyTo: { type: "batch", index: 0 } },
    ],
  });
  await f.service.moments.generateInteraction(post.id, [], "围绕照片里的猫聊天");
  const comments = f.stored!.moments!.stable![0]!.comments;
  assert.equal(comments.length, 2);
  assert.deepEqual(comments[1]!.replyTo, {
    commentId: comments[0]!.id,
    author: comments[0]!.author,
  });
  assert.equal(comments[0]!.createdAt, comments[1]!.createdAt);
  request = JSON.parse(f.prompt);
  assert.match(request.messages[0]!.content, /本次用户指引："围绕照片里的猫聊天"/);
  assert.doesNotMatch(request.messages[0]!.content, /分享逛街日常/);
  assert.doesNotMatch(JSON.stringify(f.stored), /围绕照片里的猫聊天/);
  assert.deepEqual(
    JSON.parse(request.messages[1]!.content).candidates.map((person: { id: string }) => person.id),
    ["b"],
  );
  const before = f.stored;
  f.momentOutput({ comments: [] });
  await f.service.moments.generateInteraction(post.id, [], "   ");
  assert.doesNotMatch(JSON.parse(f.prompt).messages[0].content, /本次用户指引/);
  assert.equal(f.stored, before);
  assert.deepEqual(f.service.getSnapshot().momentGeneration, {
    status: "complete",
    message: "本次无人回应。",
  });
  f.service.dispose();
});

test("朋友圈AI非法整批、截断与保存失败均不修改历史，重新生成重新调用模型", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.moments.publish({ text: "手动动态", media: [] });
  const before = f.stored;
  f.momentOutput({
    comments: [
      { authorId: "b", text: "有效前项", replyTo: null },
      { authorId: "a", text: "非法后项", replyTo: null },
    ],
  });
  await f.service.moments.generateInteraction(id);
  assert.equal(f.service.getSnapshot().momentGeneration.status, "error");
  assert.equal(f.stored, before);
  f.momentOutput({ authorId: "a", text: "AI动态", media: [] });
  f.failSave(true);
  const draft = await f.service.moments.generatePost("a");
  assert.equal(f.stored, before);
  await assert.rejects(f.service.moments.publish(draft, draft.author), /磁盘失败/);
  assert.equal(f.stored, before);
  const calls = f.calls;
  f.failSave(false);
  const retry = await f.service.moments.generatePost("a");
  assert.equal(f.calls, calls + 1);
  assert.equal(f.stored!.moments!.stable!.length, 1);
  await f.service.moments.publish(retry, retry.author);
  assert.equal(f.stored!.moments!.stable!.length, 2);
  f.truncate();
  await assert.rejects(f.service.moments.generatePost("a"), /输出上限/);
  assert.equal(f.stored!.moments!.stable!.length, 2);
  f.service.dispose();
});

test("朋友圈与单聊互斥，指导更新不改变本轮输入，切帐号取消迟到结果", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.saveReplyGuidance("b", "原指导");
  f.momentOutput({ authorId: "b", text: "旧任务动态", media: [] });
  const started = f.holdModel();
  const generation = assert.rejects(f.service.moments.generatePost("b"), { name: "AbortError" });
  await started;
  await assert.rejects(f.service.send("b", "不应发送"), /等待当前/);
  await assert.rejects(f.service.requestReply("b"), /等待当前/);
  await assert.rejects(f.service.moments.publish({ text: "不应发布", media: [] }), /等待当前/);
  await f.service.saveReplyGuidance("b", "新指导");
  assert.match(f.prompt, /原指导/);
  assert.doesNotMatch(f.prompt, /新指导/);
  await f.service.selectAccount("b");
  f.releaseModel();
  await generation;
  assert.equal(f.stored!.moments, undefined);
  assert.equal(f.stored!.replyGuidance!.stable!.b, "新指导");
  f.service.dispose();
});

test("朋友圈互动进入保存后继续提交，确认后释放任务锁", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.moments.publish({ text: "已有动态", media: [] });
  f.momentOutput({ comments: [{ authorId: "b", text: "待保存互动", replyTo: null }] });
  const started = f.holdNextSave();
  const generation = f.service.moments.generateInteraction(id);
  await started;
  assert.equal(f.service.getSnapshot().momentGeneration.status, "saving");
  f.service.moments.generation.cancel();
  assert.equal(f.service.getSnapshot().momentGeneration.status, "saving");
  await assert.rejects(f.service.moments.publish({ text: "冲突", media: [] }), /等待当前/);
  f.releaseSave();
  await generation;
  assert.equal(f.stored!.moments!.stable![0]!.comments.length, 1);
  assert.equal(f.service.getSnapshot().momentGeneration.status, "complete");
  f.service.dispose();
});

test("朋友圈配图关联写入期间无法停止，确认后显示已生成图片", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.moments.publish({
    text: "",
    media: [{ type: "image", description: "画", prompt: "天空" }],
  });
  const started = f.holdNextSave();
  const generation = f.service.moments.generateImage(id, 0);
  await started;
  assert.equal(f.service.getSnapshot().momentGeneration.status, "saving");
  f.service.moments.generation.cancel();
  assert.equal(f.service.getSnapshot().momentGeneration.status, "saving");
  await assert.rejects(f.service.moments.publish({ text: "冲突", media: [] }), /等待当前/);
  f.releaseSave();
  await generation;
  const image = f.stored!.moments!.stable![0]!.media[0]!;
  assert.equal(image.type === "image" && image.image?.id, "hub-image");
  assert.equal(f.service.getSnapshot().momentGeneration.status, "complete");
  f.service.dispose();
});

test("更换资料实例后朋友圈互动仍保存到原动态，旧完成提示不进入当前页面", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.moments.publish({ text: "已有动态", media: [] });
  f.momentOutput({ comments: [{ authorId: "b", text: "待保存互动", replyTo: null }] });
  const started = f.holdNextSave();
  const generation = f.service.moments.generateInteraction(id);
  await started;
  f.sourceChanged(true, "new-instance");
  assert.equal(f.service.getSnapshot().momentGeneration.status, "idle");
  f.releaseSave();
  await generation;
  assert.equal(f.stored!.moments!.stable![0]!.comments.length, 1);
  assert.equal(f.service.getSnapshot().momentGeneration.status, "idle");
  f.service.dispose();
});

test("更换资料实例取消朋友圈任务，即使稳定范围相同也不保存旧实例结果", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  f.momentOutput({ authorId: "a", text: "旧实例", media: [] });
  const started = f.holdModel();
  const generation = assert.rejects(f.service.moments.generatePost("a"), { name: "AbortError" });
  await started;
  f.sourceChanged(true, "new-instance");
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().scopeId, "stable");
  f.releaseModel();
  await generation;
  assert.equal(f.stored!.moments, undefined);
  f.service.dispose();
});

test("普通保存和单聊生成期间不能启动朋友圈AI，取消后的新聊天不接收旧结果", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const startedSave = f.holdNextSave();
  const saving = f.service.moments.publish({ text: "手动保存", media: [] });
  await startedSave;
  await assert.rejects(f.service.moments.generatePost("a"), /等待当前/);
  assert.equal(f.calls, 0);
  f.releaseSave();
  await saving;
  const startedReply = f.holdModel();
  const reply = f.service.requestReply("b");
  await startedReply;
  await assert.rejects(f.service.moments.generatePost("a"), /等待当前/);
  f.service.cancel();
  f.releaseModel();
  await reply;
  f.momentOutput({ authorId: "a", text: "旧聊天迟到", media: [] });
  const started = f.holdModel();
  const generation = assert.rejects(f.service.moments.generatePost("a"), { name: "AbortError" });
  await started;
  f.switchChat("new-chat");
  f.releaseModel();
  await generation;
  assert.equal(f.service.getSnapshot().data.moments, undefined);
  f.switchChat("st-chat");
  assert.equal(f.service.getSnapshot().data.moments!.stable!.length, 1);
  f.service.dispose();
});

test("朋友圈缺模型连接、无互动候选及人物删除均明确拒绝且保留历史", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.moments.publish({ text: "已有动态", media: [] });
  f.withoutDefaultConnection();
  await assert.rejects(f.service.moments.generatePost("a"), /默认模型连接/);
  assert.match(JSON.stringify(f.service.getSnapshot().momentGeneration), /默认模型连接/);
  assert.equal(f.calls, 0);
  f.removePerson("b");
  await f.service.prepare();
  await assert.rejects(f.service.moments.generateInteraction(id), /没有可参与/);
  f.removePerson("a");
  await f.service.prepare();
  assert.equal(f.service.getSnapshot().data.account, null);
  assert.equal(f.service.getSnapshot().data.moments!.stable![0]!.author.id, "a");
  await assert.rejects(f.service.moments.publish({ text: "失效帐号", media: [] }), /资料不可用/);
  assert.equal(f.calls, 0);
  f.service.dispose();
});

test("朋友圈指定互动固定所选名单并要求全部参与，遗漏或越界不保存", async () => {
  const f = fixture();
  f.addPerson("c");
  f.addPerson("d");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.saveReplyGuidance("c", "选中人物指导");
  await f.service.saveReplyGuidance("d", "未选人物指导");
  const id = await f.service.moments.publish({ text: "指定互动", media: [] });
  const selected = ["b", "c"];
  const started = f.holdModel();
  const generation = f.service.moments.generateInteraction(id, selected);
  await started;
  selected.splice(0, selected.length, "d");
  const request = JSON.parse(f.prompt) as {
    messages: {
      content: string;
    }[];
  };
  const material = JSON.parse(request.messages[1]!.content);
  assert.deepEqual(material.requiredAuthorIds, ["b", "c"]);
  assert.equal(material.participationMode, "selected");
  assert.deepEqual(
    material.candidates.map((person: { id: string }) => person.id),
    ["b", "c"],
  );
  assert.equal(material.account.id, "a");
  assert.match(request.messages[0]!.content, /选中人物指导/);
  assert.doesNotMatch(request.messages[0]!.content, /未选人物指导/);
  f.momentOutput({
    comments: [
      { authorId: "c", text: "丙先回复", replyTo: null },
      { authorId: "b", text: "乙回复丙", replyTo: { type: "batch", index: 0 } },
    ],
  });
  f.releaseModel();
  await generation;
  assert.deepEqual(
    f.stored!.moments!.stable![0]!.comments.map((comment) => comment.author.id),
    ["c", "b"],
  );
  const before = f.stored;
  for (const comments of [
    [],
    [{ authorId: "b", text: "漏了丙", replyTo: null }],
    [{ authorId: "d", text: "未选人物", replyTo: null }],
  ]) {
    f.momentOutput({ comments });
    await f.service.moments.generateInteraction(id, ["b", "c"]);
    assert.equal(f.service.getSnapshot().momentGeneration.status, "error");
    assert.equal(f.stored, before);
  }
  f.service.dispose();
});

test("朋友圈互动选择拒绝当前帐号、未知人物、重复与超限，允许五人各一条", async () => {
  const f = fixture();
  for (const id of ["c", "d", "e", "f", "g"]) {
    f.addPerson(id);
  }
  await f.service.prepare();
  await f.service.selectAccount("a");
  const id = await f.service.moments.publish({ text: "互动人数边界", media: [] });
  for (const selected of [["a"], ["unknown"], ["b", "b"], ["b", "c", "d", "e", "f", "g"]]) {
    await assert.rejects(
      f.service.moments.generateInteraction(id, selected),
      /当前帐号|有效资料|重复|最多/,
    );
  }
  assert.equal(f.calls, 0);
  const participants = ["b", "c", "d", "e", "f"];
  f.momentOutput({
    comments: participants.map((authorId) => ({ authorId, text: "每人一条", replyTo: null })),
  });
  await f.service.moments.generateInteraction(id, participants);
  assert.equal(f.service.getSnapshot().momentGeneration.status, "complete");
  assert.equal(f.stored!.moments!.stable![0]!.comments.length, 5);
  f.momentOutput({ comments: [] });
  await f.service.moments.generateInteraction(id, []);
  assert.deepEqual(f.service.getSnapshot().momentGeneration, {
    status: "complete",
    message: "本次无人回应。",
  });
  f.service.dispose();
});

test("草稿完善Prompt返回编辑值且不发布，非法输出与取消保留原草稿", async () => {
  const f = fixture();
  await f.service.prepare();
  await f.service.selectAccount("a");
  const draft = {
    author: { id: "b", name: "乙", scopeId: "stable" },
    text: "窗边",
    media: [{ type: "image" as const, description: "乙在窗边", prompt: "原Prompt" }],
  };
  f.momentOutput({ prompt: "乙在窗边，第三人称侧面近景，窗外光线照亮面部，背景是柔和的窗框。" });
  const refined = await f.service.moments.refineDraftImagePrompt(draft, 0);
  assert.match(refined, /第三人称/);
  assert.equal(draft.media[0]!.prompt, "原Prompt");
  assert.equal(f.stored!.moments, undefined);
  f.momentOutput({ prompt: "", extra: "非法" });
  await assert.rejects(f.service.moments.refineDraftImagePrompt(draft, 0), /输出无效/);
  const started = f.holdModel();
  const canceled = assert.rejects(f.service.moments.refineDraftImagePrompt(draft, 0), {
    name: "AbortError",
  });
  await started;
  f.service.cancel();
  f.releaseModel();
  await canceled;
  assert.equal(f.stored!.moments, undefined);
  assert.equal(draft.media[0]!.prompt, "原Prompt");
  f.service.dispose();
});

test("撤回只允许本人，保留原内容且下一轮只收到撤回提示", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "不可发送的原文");
  await f.service.enqueue("b", "继续发送");
  const [original, pending] = f.service.getConversation("b")!.messages;
  await f.service.selectAccount("b");
  await f.service.editMessage("a", original!.id, "recall");
  assert.match(f.service.getSnapshot().operationError!, /只能撤回自己/);
  assert.equal(f.service.getConversation("a")!.messages[0]!.recalled, undefined);

  f.service.dismissOperationError();
  await f.service.selectAccount("a");
  await f.service.editMessage("b", original!.id, "recall");
  assert.deepEqual(f.stored!.conversations[0]!.messages[0], { ...original, recalled: true });
  assert.deepEqual(pendingWechatMessages(f.service.getConversation("b")!, "a"), [pending]);
  await f.service.requestReply("b");
  const payload = latestPayload(f.prompt);
  assert.deepEqual(
    payload.本轮输入.map((message: { text: string }) => message.text),
    ["继续发送"],
  );
  assert.equal(payload.当前微信历史[0].type, "recalled");
  assert.match(f.prompt, /消息已撤回/);
  assert.doesNotMatch(f.prompt, /不可发送的原文/);
  f.service.dispose();
});

test("删除从共享历史移除消息并原位保留屏障和双方队列", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "删除的待回复消息");
  const target = f.service.getConversation("b")!.messages[0]!;
  const before = await f.service.memory.insert("b", null);
  await f.service.memory.setEnabled("b", before!, false);
  const after = await f.service.memory.insert("b", target.id);
  await f.service.enqueue("b", "甲的剩余队列");
  await f.service.selectAccount("b");
  await f.service.enqueue("a", "乙的队列");

  f.failSave(true);
  await f.service.editMessage("a", target.id, "delete");
  assert.equal(f.service.getConversation("a")!.messages[0]!.id, target.id);
  assert.match(f.service.getSnapshot().operationError!, /删除消息失败.*磁盘失败/);

  f.failSave(false);
  f.service.dismissOperationError();
  await f.service.editMessage("a", target.id, "delete");
  const restored = f.restore();
  await restored.prepare();
  const next = restored.getConversation("a")!;
  assert.deepEqual(
    next.messages.map((message) => message.content.text),
    ["甲的剩余队列", "乙的队列"],
  );
  assert.deepEqual(pendingWechatMessages(next, "a"), [next.messages[0]]);
  assert.deepEqual(pendingWechatMessages(next, "b"), [next.messages[1]]);
  assert.deepEqual(next.memoryBarriers, [
    { id: before, afterMessageId: null, enabled: false },
    { id: after, afterMessageId: null, enabled: true },
  ]);
  await restored.selectAccount("a");
  assert.deepEqual(restored.getConversation("b"), next);
  restored.dispose();
  f.service.dispose();
});

test("取消撤回恢复未完成的队列位置，已完成的消息只回到历史", async () => {
  const f = fixture();
  f.preferences.setSendMode("delayed");
  await f.service.prepare();
  await f.service.selectAccount("a");
  await f.service.enqueue("b", "可恢复的消息");
  const original = f.service.getConversation("b")!.messages[0]!;
  await f.service.editMessage("b", original.id, "recall");
  await f.service.enqueue("b", "随后入队的消息");
  await f.service.selectAccount("b");
  await f.service.editMessage("a", original.id, "restore");
  assert.match(f.service.getSnapshot().operationError!, /只能撤回自己/);
  assert.equal(f.service.getConversation("a")!.messages[0]!.recalled, true);

  f.service.dismissOperationError();
  await f.service.selectAccount("a");
  await f.service.editMessage("b", original.id, "restore");
  assert.equal(f.stored!.conversations[0]!.messages[0]!.recalled, undefined);
  assert.deepEqual(
    pendingWechatMessages(f.service.getConversation("b")!, "a").map(
      (message) => message.content.text,
    ),
    ["可恢复的消息", "随后入队的消息"],
  );

  await f.service.editMessage("b", original.id, "recall");
  const later = f.service.getConversation("b")!.messages[1]!;
  await f.service.editMessage("b", later.id, "delete");
  await f.service.requestReply("b");
  await f.service.editMessage("b", original.id, "restore");
  assert.deepEqual(pendingWechatMessages(f.service.getConversation("b")!, "a"), []);
  await f.service.requestReply("b");
  assert.deepEqual(latestPayload(f.prompt).本轮输入, []);
  assert.equal(latestPayload(f.prompt).当前微信历史[0].text, "可恢复的消息");
  f.service.dispose();
});

test("wechat recovers the saved account when Memory catches up after a chat switch", async () => {
  const f = fixture();
  try {
    await f.service.prepare();
    await f.service.selectAccount("a");
    f.switchChat("other-chat");
    f.setScope("other-stable");
    f.switchChat("st-chat");
    await f.service.prepare();
    assert.equal(f.service.getSnapshot().data.account, null);

    f.setScope("stable");
    f.sourceChanged(true, "instance");
    await new Promise(setImmediate);
    assert.deepEqual(f.service.getSnapshot().data.account, f.stored!.account);
  } finally {
    f.service.dispose();
  }
});
