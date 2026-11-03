import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWechatMomentFullTime,
  formatWechatMomentTime,
  formatWechatTime,
  needsWechatTimeSeparator,
} from "./wechat-time.ts";
import { buildWechatPrompt, wechatSystemPrompt } from "./wechat-prompt.ts";

test("local calendar labels distinguish today, yesterday, dates and years", () => {
  const now = new Date(2026, 10, 3, 16);
  const today = new Date(2026, 10, 3, 14, 32).toISOString();
  const yesterday = new Date(2026, 10, 2, 14, 32).toISOString();
  const earlier = new Date(2026, 9, 30, 14, 32).toISOString();
  const lastYear = new Date(2025, 11, 31, 14, 32).toISOString();
  assert.equal(formatWechatTime(today, now), "14:32");
  assert.equal(formatWechatTime(yesterday, now), "昨天 14:32");
  assert.equal(formatWechatTime(yesterday, now, true), "昨天");
  assert.equal(formatWechatTime(earlier, now), "10/30 14:32");
  assert.equal(formatWechatTime(earlier, now, true), "10/30");
  assert.equal(formatWechatTime(lastYear, now), "2025/12/31 14:32");
  assert.equal(formatWechatTime(today, new Date(2026, 10, 4)), "昨天 14:32");
});

test("moment labels use relative minutes, hours, yesterday and calendar dates", () => {
  const now = new Date(2026, 10, 3, 16);
  assert.equal(
    formatWechatMomentTime(new Date(2026, 10, 3, 15, 59, 30).toISOString(), now),
    "刚刚",
  );
  assert.equal(
    formatWechatMomentTime(new Date(2026, 10, 3, 15, 55).toISOString(), now),
    "5 分钟前",
  );
  assert.equal(formatWechatMomentTime(new Date(2026, 10, 3, 13).toISOString(), now), "3 小时前");
  assert.equal(
    formatWechatMomentTime(new Date(2026, 10, 2, 23, 5).toISOString(), now),
    "昨天 23:05",
  );
  assert.equal(formatWechatMomentTime(new Date(2026, 9, 30, 14).toISOString(), now), "10/30");
  assert.equal(formatWechatMomentTime(new Date(2025, 11, 31, 14).toISOString(), now), "2025/12/31");
  assert.equal(
    formatWechatMomentFullTime(new Date(2026, 10, 3, 17, 12).toISOString()),
    "2026/11/3 17:12",
  );
});

test("message separators cover first message, five-minute boundary and midnight", () => {
  const start = new Date(2026, 10, 3, 12).toISOString();
  assert.equal(needsWechatTimeSeparator(start), true);
  assert.equal(needsWechatTimeSeparator(start, start), false);
  assert.equal(needsWechatTimeSeparator(new Date(2026, 10, 3, 12, 5).toISOString(), start), false);
  assert.equal(
    needsWechatTimeSeparator(new Date(2026, 10, 3, 12, 5, 1).toISOString(), start),
    true,
  );
  assert.equal(
    needsWechatTimeSeparator(
      new Date(2026, 10, 4, 0, 0, 1).toISOString(),
      new Date(2026, 10, 3, 23, 59, 59).toISOString(),
    ),
    true,
  );
});

const input: Parameters<typeof buildWechatPrompt>[0] = {
  sender: { id: "A", name: "甲", profileText: "人物甲" },
  recipient: { id: "B", name: "乙", profileText: "人物乙" },
  historyMessageLimit: 30,
  summary: "剧情仍停在同一天",
  related: { relationships: [], heldItems: [], importantEvents: [], otherCharacters: [] },
  recent: {
    chatIdentity: "chat",
    cleaning: { enabled: false, ruleId: null, ruleName: null },
    messages: [],
  },
  world: [],
  now: new Date("2026-11-03T08:00:00Z"),
  conversation: {
    id: "pair",
    people: [
      { id: "A", name: "甲", scopeId: "scope" },
      { id: "B", name: "乙", scopeId: "scope" },
    ],
    pendingReplies: { A: "1" },
    messages: Array.from({ length: 35 }, (_, index) => ({
      id: String(index),
      senderId: index === 0 ? "B" : "A",
      createdAt: index === 0 ? "2026-11-02T08:00:00Z" : "2026-11-03T07:59:00Z",
      content: { type: "text", text: `消息${index}` },
    })),
  },
};

test("pending batches retain their gap before the window and timestamps within the batch", () => {
  const prompt = JSON.parse(buildWechatPrompt(input));
  assert.equal(prompt.本轮输入.length, 34);
  assert.equal(prompt.本轮输入[0].createdAt, "2026-11-03T07:59:00Z");
  assert.equal(prompt.本轮输入[0].距上一条消息秒数, 86340);
  assert.equal(prompt.本轮输入[1].距上一条消息秒数, 0);
  assert.equal(prompt.微信现实时间.本轮与此前消息间隔秒数, 86340);
  assert.equal(prompt.微信现实时间.距最后消息秒数, 60);
  assert.equal(prompt.微信现实时间.当前时刻, input.now!.toISOString());
  assert.equal(prompt.微信现实时间.设备时区, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.deepEqual(prompt.世界状态, input.world);
  assert.equal(prompt.剧情总结, input.summary);
  assert.match(wechatSystemPrompt, /不能据此推进剧情日期/);
});

test("proactive and empty conversations describe elapsed time without creating pending messages", () => {
  const proactive = JSON.parse(
    buildWechatPrompt({
      ...input,
      conversation: {
        ...input.conversation,
        pendingReplies: {},
        messages: input.conversation.messages.slice(0, 1),
      },
    }),
  );
  assert.equal(proactive.本轮任务, "主动发起聊天");
  assert.equal(proactive.微信现实时间.本轮首条待回复消息时刻, null);
  assert.equal(proactive.微信现实时间.本轮与此前消息间隔秒数, 86400);
  const empty = JSON.parse(
    buildWechatPrompt({
      ...input,
      conversation: { ...input.conversation, pendingReplies: {}, messages: [] },
    }),
  );
  assert.equal(empty.微信现实时间.本轮与此前消息间隔秒数, null);
  assert.equal(empty.微信现实时间.距最后消息秒数, null);
});
