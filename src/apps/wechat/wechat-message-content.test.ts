import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWechatPaymentAction,
  formatWechatAmount,
  parseWechatAmount,
} from "./wechat-message-content.ts";
import type { WechatConversation } from "./wechat.ts";

test("人民币按整数分保存，含一位小数和安全整数上限", () => {
  assert.equal(parseWechatAmount(" 12.5 "), 1250);
  assert.equal(parseWechatAmount("0.01"), 1);
  assert.equal(parseWechatAmount("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  assert.equal(formatWechatAmount(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  for (const input of ["", "0.00", "-1", "1.005", "1e3", "90071992547409.92"]) {
    assert.throws(() => parseWechatAmount(input), /金额/);
  }
});

test("仅接收方可处理未撤回、未处理且匹配动作的付款卡片", () => {
  const createdAt = "2026-11-12T08:00:00Z";
  const conversation: WechatConversation = {
    id: "pair",
    people: [
      { id: "a", scopeId: "world", name: "甲" },
      { id: "b", scopeId: "world", name: "乙" },
    ],
    messages: [
      {
        id: "gift",
        senderId: "a",
        createdAt,
        content: { type: "redPacket", amountFen: 600, note: "", status: "pending" },
      },
      {
        id: "transfer",
        senderId: "b",
        createdAt,
        content: { type: "transfer", amountFen: 1000, note: "", status: "pending" },
      },
      {
        id: "recalled",
        senderId: "a",
        createdAt,
        content: { type: "transfer", amountFen: 400, note: "", status: "pending" },
        recalled: true,
      },
    ],
    pendingReplies: { a: "gift" },
  };
  const gift = conversation.messages[0]!;
  const transfer = conversation.messages[1]!;
  const claimed = applyWechatPaymentAction(conversation, "b", "gift", "claim");
  assert.deepEqual(claimed.messages[0], {
    ...gift,
    content: { ...gift.content, status: "claimed" },
  });
  assert.deepEqual(claimed.pendingReplies, conversation.pendingReplies);
  assert.strictEqual(claimed.messages[1], transfer);
  for (const [action, status] of [
    ["receive", "received"],
    ["return", "returned"],
  ] as const) {
    const changed = applyWechatPaymentAction(conversation, "a", "transfer", action);
    assert.deepEqual(changed.messages[1], {
      ...transfer,
      content: { ...transfer.content, status },
    });
  }
  assert.throws(() => applyWechatPaymentAction(conversation, "a", "gift", "claim"), /接收方/);
  assert.throws(() => applyWechatPaymentAction(conversation, "c", "gift", "claim"), /接收方/);
  assert.throws(() => applyWechatPaymentAction(conversation, "b", "recalled", "receive"), /已撤回/);
  assert.throws(() => applyWechatPaymentAction(conversation, "b", "gift", "receive"), /不支持/);
  assert.throws(() => applyWechatPaymentAction(claimed, "b", "gift", "claim"), /已处理/);
});
