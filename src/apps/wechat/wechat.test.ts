import assert from "node:assert/strict";
import test from "node:test";
import { conversationId } from "./wechat.ts";
import { parseWechatReply, buildWechatPrompt } from "./wechat-prompt.ts";

test("bidirectional conversation identity retains scope and distinct people", () => {
  assert.equal(conversationId("scope", "A", "B"), conversationId("scope", "B", "A"));
  assert.notEqual(conversationId("scope", "A", "B"), conversationId("other", "A", "B"));
});
test("reply boundaries come only from valid explicit text messages", () => {
  assert.deepEqual(
    parseWechatReply(
      '{"messages":[{"type":"text","text":" 一。二。 "},{"type":"text","text":"三"}]}',
    ),
    [
      { type: "text", text: "一。二。" },
      { type: "text", text: "三" },
    ],
  );
  for (const invalid of [
    '```json\n{"messages":[]}\n```',
    "{}",
    '{"messages":[]}',
    '{"messages":[{"type":"image","text":"x"}]}',
    '{"messages":[{"type":"text","text":" "}]}',
  ]) {
    assert.throws(() => parseWechatReply(invalid));
  }
});
test("prompt limits this conversation to thirty including latest and carries explicit background", () => {
  const prompt = JSON.parse(
    buildWechatPrompt({
      sender: { id: "A", name: "甲", profileText: "人物甲" },
      recipient: { id: "B", name: "乙", profileText: "人物乙" },
      summary: "全部总结",
      related: { relationships: [], heldItems: [], importantEvents: [], otherCharacters: [] },
      recent: {
        chatIdentity: "chat",
        cleaning: { enabled: false, ruleId: null, ruleName: null },
        messages: [],
      },
      world: [],
      conversation: {
        id: "pair",
        people: [
          { id: "A", scopeId: "scope", name: "甲" },
          { id: "B", scopeId: "scope", name: "乙" },
        ],
        messages: Array.from({ length: 31 }, (_, index) => ({
          id: String(index),
          senderId: "A",
          createdAt: "now",
          content: { type: "text", text: `消息${index}` },
        })),
      },
    }),
  );
  assert.equal(prompt.当前微信对话.length, 30);
  assert.equal(prompt.当前微信对话[0].text, "消息1");
  assert.equal(prompt.当前微信对话.at(-1).text, "消息30");
  assert.equal(prompt.剧情总结, "全部总结");
});
