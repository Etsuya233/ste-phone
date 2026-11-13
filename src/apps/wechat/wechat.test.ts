import assert from "node:assert/strict";
import test from "node:test";
import { conversationId } from "./wechat.ts";
import { buildWechatPrompt } from "./wechat-prompt.ts";
import { parseWechatReply } from "./wechat-reply-output.ts";

test("bidirectional conversation identity retains scope and distinct people", () => {
  assert.equal(conversationId("scope", "A", "B"), conversationId("scope", "B", "A"));
  assert.notEqual(conversationId("scope", "A", "B"), conversationId("other", "A", "B"));
});
test("reply parser preserves explicit message boundaries and rejects invalid output", () => {
  assert.deepEqual(
    parseWechatReply(
      '{"messages":[{"type":"text","text":" 一。二。 "},{"type":"text","text":"三"}]}',
    ).messages,
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
    '{"messages":[{"type":"image","description":"海边","prompt":" "}]}',
    '{"messages":[{"type":"image","description":"海边","prompt":"日落","image":"/forged.png"}]}',
    '{"messages":[{"type":"redPacket","amountFen":8.88,"note":""}]}',
    '{"messages":[{"type":"transfer","amountFen":100,"note":"","status":"received"}]}',
    '{"messages":[],"paymentActions":[{"messageId":"card","action":"receive"},{"messageId":"card","action":"return"}]}',
  ]) {
    assert.throws(() => parseWechatReply(invalid));
  }
});
test("prompt retains all pending messages and carries explicit background", () => {
  const prompt = JSON.parse(
    buildWechatPrompt({
      sender: { id: "A", name: "甲", profileText: "人物甲" },
      recipient: { id: "B", name: "乙", profileText: "人物乙" },
      historyMessageLimit: 30,
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
          createdAt: "2026-11-02T08:00:00Z",
          content: { type: "text", text: `消息${index}` },
        })),
      },
    }),
  );
  assert.equal(prompt.本轮输入.length, 31);
  assert.equal(prompt.本轮输入[0].text, "消息0");
  assert.equal(prompt.本轮输入.at(-1).text, "消息30");
  assert.equal(prompt.剧情总结, "全部总结");
});
