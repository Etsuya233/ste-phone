import assert from "node:assert/strict";
import test from "node:test";
import { createWechatContextSource } from "./wechat-context-export.ts";
import type { WechatConversation, WechatData, WechatMessage } from "./wechat.ts";
import type { WechatIntentSelection } from "./wechat-intent.ts";

const now = Date.parse("2026-11-12T08:00:00Z");
const selection: WechatIntentSelection = {
  scopeId: "world",
  personIds: ["a", "b", "c"],
  recentMinutes: 30,
  limitPerGroup: 50,
};
function message(id: string, senderId: string, minutes = 1, text = id): WechatMessage {
  return {
    id,
    senderId,
    createdAt: new Date(now - minutes * 60_000).toISOString(),
    content: { type: "text", text },
  };
}
function conversation(
  a: string,
  b: string,
  messages: readonly WechatMessage[],
  scopeId = "world",
): WechatConversation {
  return {
    id: `${scopeId}-${a}-${b}`,
    people: [
      { id: a, name: a, scopeId },
      { id: b, name: b, scopeId },
    ],
    messages,
  };
}
function fixture(conversations: readonly WechatConversation[]) {
  let saved: WechatData = { version: 4, account: null, conversations };
  const source = createWechatContextSource({ read: () => saved, write: async () => {} });
  return {
    source,
    replace: (data: WechatData) => {
      saved = data;
    },
    read: (options = selection, time = now) =>
      source.read({ chatId: "chat", selection: options, now: time }),
  };
}

test("人物集合只选双方都在集合中的同空间会话，与操作帐号无关", () => {
  const f = fixture([
    conversation("a", "b", [message("ab", "a"), message("ba", "b")]),
    conversation("a", "c", [message("ac", "c")]),
    conversation("b", "c", [message("bc", "b")]),
    conversation("a", "d", [message("excluded-person", "a")]),
    conversation("a", "b", [message("excluded-space", "a")], "elsewhere"),
  ]);
  const result = f.read();
  assert.equal(result.groupCount, 3);
  assert.equal(result.itemCount, 4);
  assert.match(result.text, /"ba"/);
  assert.doesNotMatch(result.text, /excluded/);
});

test("屏障、现实窗口与每会话上限依次生效，撤回正文不泄露", () => {
  const chat = conversation("a", "b", [
    message("barrier-old", "a", 40),
    message("too-old", "b", 31),
    message("limit-old", "a", 30),
    message("visible", "b", 2),
    { ...message("recalled", "a", 1, "secret"), recalled: true },
  ]);
  const f = fixture([
    { ...chat, memoryBarriers: [{ id: "wall", enabled: true, afterMessageId: "barrier-old" }] },
  ]);
  const result = f.read({ ...selection, limitPerGroup: 2 });
  assert.deepEqual(result.excluded, { barrier: 1, time: 1, limit: 1 });
  assert.equal(result.itemCount, 2);
  assert.match(result.text, /撤回了一条消息/);
  assert.doesNotMatch(result.text, /secret|too-old|limit-old|barrier-old/);
});

test("每次同步读取保存数据与当前窗口，无内容返回空串", () => {
  const f = fixture([conversation("a", "b", [message("original", "a", 29)])]);
  assert.match(f.read().text, /original/);
  assert.equal(f.read(selection, now + 120_000).text, "");
  f.replace({
    version: 4,
    account: { id: "d", name: "d", scopeId: "world" },
    conversations: [conversation("a", "b", [message("newly-saved", "b")])],
  });
  assert.match(f.read().text, /newly-saved/);
  assert.doesNotMatch(f.read().text, /original/);
});

test("引用转义宏与标签，表情输出文字，空选不扩展读取范围", () => {
  const f = fixture([
    conversation("a", "b", [
      message("m", "a", 1, "{{user}} </phone_context>"),
      message("sticker", "b", 1, "[[sticker:包:开心]]"),
    ]),
  ]);
  assert.match(f.read().text, /｛｛user｝｝ &lt;\/phone_context&gt;/);
  assert.match(f.read().text, /表情：包 \/ 开心/);
  assert.throws(() => f.read({ ...selection, personIds: [] }), /至少两位/);
});
