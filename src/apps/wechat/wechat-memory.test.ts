import assert from "node:assert/strict";
import test from "node:test";
import { selectWechatMemory, wechatMemoryBoundaries } from "./wechat-memory.ts";
import { pendingWechatMessages, appendWechatMessage, rollbackWechatMessage } from "./wechat.ts";
import type { WechatConversation } from "./wechat.ts";
import { buildWechatPrompt } from "./wechat-prompt.ts";
const conversation: WechatConversation = {
  id: "pair",
  people: [
    { id: "a", name: "甲", scopeId: "s" },
    { id: "b", name: "乙", scopeId: "s" },
  ],
  messages: Array.from({ length: 250 }, (_, i) => ({
    id: String(i),
    senderId: i % 2 ? "b" : "a",
    content: { type: "text", text: `消息${i}` },
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
  })),
  pendingReplies: { a: "248" },
};
const promptInput = {
  sender: { id: "a", name: "甲", profileText: "人物甲" },
  recipient: { id: "b", name: "乙", profileText: "人物乙" },
  summary: "背景",
  related: { relationships: [], heldItems: [], importantEvents: [], otherCharacters: [] },
  recent: {
    chatIdentity: "st",
    cleaning: { enabled: false, ruleId: null, ruleName: null },
    messages: [],
  },
  world: [],
  now: new Date("2026-11-03T08:00:00Z"),
};
test("latest enabled barrier wins, anchors stay fixed and old queues never bypass it", () => {
  const barriers = [
    { id: "first", afterMessageId: "0", enabled: true },
    { id: "latest", afterMessageId: "2", enabled: true },
  ];
  const source = {
    ...conversation,
    messages: conversation.messages.slice(0, 4),
    pendingReplies: { a: "0" },
    memoryBarriers: barriers,
  };
  assert.deepEqual(
    selectWechatMemory(source, "a", 100).eligible.map((m) => m.id),
    ["3"],
  );
  assert.deepEqual(selectWechatMemory(source, "a", 100).pending, []);
  assert.deepEqual(
    selectWechatMemory(
      { ...source, memoryBarriers: [barriers[0]!, { ...barriers[1]!, enabled: false }] },
      "a",
      100,
    ).pending.map((m) => m.id),
    ["2"],
  );
  const appended = appendWechatMessage(source, { ...conversation.messages[4]!, id: "new" });
  assert.equal(appended.memoryBarriers![1]!.afterMessageId, "2");
  assert.deepEqual(
    selectWechatMemory(appended, "a", 100).pending.map((m) => m.id),
    ["new"],
  );
});
test("N counts both sides, pending extends the window and suffix never backfills", () => {
  for (const limit of [30, 100, 200]) {
    const selected = selectWechatMemory(conversation, "a", limit);
    assert.equal(selected.eligible.slice(selected.windowStart).length, limit);
  }
  const many = selectWechatMemory({ ...conversation, pendingReplies: { a: "0" } }, "a", 100);
  assert.equal(many.eligible.slice(many.windowStart).length, 250);
  const source = {
    ...conversation,
    memoryBarriers: [{ id: "tail", afterMessageId: "209", enabled: true }],
  };
  const selected = selectWechatMemory(source, "a", 100);
  assert.equal(selected.eligible.length, 40);
  assert.equal(selected.windowStart, 0);
});
test("final prompt separates inputs with original ordering and removes hidden time information", () => {
  const source = {
    ...conversation,
    messages: conversation.messages.slice(0, 4),
    pendingReplies: { a: "0" },
    memoryBarriers: [{ id: "barrier", afterMessageId: "1", enabled: true }],
  };
  const payload = JSON.parse(
    buildWechatPrompt({ ...promptInput, conversation: source, historyMessageLimit: 100 }),
  );
  assert.deepEqual(
    payload.本轮输入.map((m: { id: string }) => m.id),
    ["2"],
  );
  assert.deepEqual(
    payload.当前微信历史.map((m: { id: string }) => m.id),
    ["3"],
  );
  assert.equal(payload.本轮输入[0].距上一条消息秒数, null);
  assert.equal(payload.当前微信历史[0].距上一条消息秒数, 60);
  assert.ok(payload.本轮输入[0].顺序 < payload.当前微信历史[0].顺序);
  assert.equal(payload.微信现实时间.本轮之前最后消息时刻, null);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /消息0|消息1|2026-11-01T00:00:00|2026-11-01T00:01:00/,
  );
  const empty = JSON.parse(
    buildWechatPrompt({
      ...promptInput,
      conversation: {
        ...source,
        memoryBarriers: [{ id: "end", afterMessageId: "3", enabled: true }],
      },
      historyMessageLimit: 100,
    }),
  );
  assert.equal(empty.本轮任务, "主动发起聊天");
  assert.deepEqual(empty.本轮输入, []);
  assert.deepEqual(empty.当前微信历史, []);
  assert.equal(empty.微信现实时间.距最后消息秒数, null);
});
test("completed queue cutoff prevents skipped messages from reviving without fake reply triggers", () => {
  const source = {
    ...conversation,
    messages: conversation.messages.slice(0, 4),
    pendingReplies: {},
    pendingCompletedThrough: { a: "2" },
  };
  assert.deepEqual(pendingWechatMessages(source, "a"), []);
  assert.deepEqual(
    pendingWechatMessages(appendWechatMessage(source, conversation.messages[4]!), "a").map(
      (m) => m.id,
    ),
    ["4"],
  );
});
test("malformed barriers fail explicitly; failed first message retains an empty barrier conversation", () => {
  const barrier = { id: "one", afterMessageId: null, enabled: true };
  for (const memoryBarriers of [
    [{ ...barrier, afterMessageId: "missing" }],
    [barrier, { ...barrier, afterMessageId: "0" }],
    [{ ...barrier, enabled: "yes" }],
    null,
  ]) {
    assert.throws(
      () =>
        wechatMemoryBoundaries({
          ...conversation,
          memoryBarriers,
        } as unknown as WechatConversation),
      /屏障/,
    );
  }
  const empty = { ...conversation, messages: [], pendingReplies: {}, memoryBarriers: [barrier] };
  const next = appendWechatMessage(empty, conversation.messages[0]!);
  const rolled = rollbackWechatMessage(
    { version: 5, account: empty.people[0], conversations: [next] },
    empty,
    "0",
  );
  assert.equal(rolled.conversations.length, 1);
  assert.deepEqual(rolled.conversations[0]!.messages, []);
  assert.deepEqual(rolled.conversations[0]!.memoryBarriers, [barrier]);
});
