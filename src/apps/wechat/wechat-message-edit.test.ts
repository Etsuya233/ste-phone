import assert from "node:assert/strict";
import test from "node:test";
import { editWechatMessage } from "./wechat-message-edit.ts";
import { readWechatData } from "./wechat-migrations.ts";
import { pendingWechatMessages, type WechatConversation } from "./wechat.ts";

test("删除旧版历史中的回复或触发消息后，已完成消息不会重新入队", () => {
  const conversation: WechatConversation = {
    id: "pair",
    people: [
      { id: "a", scopeId: "s", name: "甲" },
      { id: "b", scopeId: "s", name: "乙" },
    ],
    messages: ["earlier", "trigger", "reply", "queued"].map((id) => ({
      id,
      senderId: id === "reply" ? "b" : "a",
      content: { type: "text", text: id },
      createdAt: "2026-11-06T00:00:00.000Z",
      ...(id === "reply" ? { reply: { batchId: "batch", triggerMessageId: "trigger" } } : {}),
    })),
  };
  const loaded = readWechatData({ version: 2, account: null, conversations: [conversation] });
  for (const target of ["trigger", "reply"]) {
    const next = editWechatMessage(loaded.conversations[0]!, "a", target, "delete");
    const stored = readWechatData({ ...loaded, conversations: [next] }).conversations[0]!;
    assert.deepEqual(
      pendingWechatMessages(stored, "a").map(({ id }) => id),
      ["queued"],
    );
    assert.deepEqual(pendingWechatMessages(stored, "b"), []);
    assert.equal(
      stored.messages.find(({ id }) => id === "reply")?.reply?.triggerMessageId,
      undefined,
    );
    if (target === "trigger") {
      assert.equal(stored.messages.find(({ id }) => id === "reply")?.reply?.batchId, "batch");
    }
  }
});
