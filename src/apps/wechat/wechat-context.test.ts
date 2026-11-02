import assert from "node:assert/strict";
import test from "node:test";
import { memoryDatabaseFixture } from "../../../tests/fixtures/memory-database.ts";
import { relatedBackgroundSnapshot } from "../../../tests/fixtures/related-background-snapshot.ts";
import { MemoryDatabaseProvider } from "../../infrastructure/ste-memory/memory-database-provider.ts";
import { PhoneDataService } from "../data-source/data-service.ts";
import { readWechatPrompt } from "./wechat-context.ts";
import type { WechatConversation } from "./wechat.ts";

test("SQL-backed prompt includes one-hop context while preserving summary and ten/thirty windows", async () => {
  const memory = memoryDatabaseFixture(relatedBackgroundSnapshot(true));
  memory.install();
  Object.assign(memory.api, {
    chat: {
      version: 1,
      async readRecent(request: { count: number }) {
        assert.equal(request.count, 10);
        return {
          chatIdentity: "chat-a",
          cleaning: { enabled: true, ruleId: "clean", ruleName: "正文" },
          messages: [{ floor: 4, role: "assistant", name: "小蓝", content: "已经清洗的ST正文" }],
        };
      },
    },
  });
  memory.db.exec(
    `INSERT INTO plot_summaries("$record_id","$stable_id","$created_at",summary,details) VALUES ('instance-summary','summary','earlier','早期总结','必须保留的完整总结'); UPDATE chronicle SET plot_summary='instance-summary' WHERE "$stable_id"='event-1';`,
  );
  const provider = new MemoryDatabaseProvider();
  const data = new PhoneDataService(provider);
  try {
    const scope = data.getSnapshot().context;
    const roster = await data.readBackground(scope);
    const sender = roster.characters.find((person) => person.id === "red")!;
    const recipient = roster.characters.find((person) => person.id === "blue")!;
    const conversation: WechatConversation = {
      id: "pair",
      people: [
        { id: sender.id, name: sender.name, scopeId: roster.stableScopeId },
        { id: recipient.id, name: recipient.name, scopeId: roster.stableScopeId },
      ],
      pendingReplies: { [sender.id]: "34" },
      messages: Array.from({ length: 35 }, (_, index) => ({
        id: String(index),
        senderId: sender.id,
        content: { type: "text", text: `微信${index}` },
        createdAt: "now",
      })),
    };
    const payload = JSON.parse(
      await readWechatPrompt(data, scope, sender, recipient, conversation),
    );
    assert.deepEqual(payload.当前帐号, sender);
    assert.deepEqual(payload.你扮演的回复人物, recipient);
    assert.match(payload.剧情总结, /必须保留的完整总结/);
    assert.match(payload.剧情总结, /借出的笔记本/);
    assert.doesNotMatch(payload.剧情总结, /放学后，小红与小蓝在图书馆讨论/);
    assert.equal(payload.当前微信对话.length, 30);
    assert.equal(payload.当前微信对话[0].text, "微信5");
    assert.equal(payload.当前微信对话.at(-1).text, "微信34");
    assert.equal(payload.最近ST消息[0].content, "已经清洗的ST正文");
    assert.equal(payload.世界状态[0].location, "学校图书馆");
    assert.deepEqual(
      payload.关联背景.otherCharacters.map((person: { id: string }) => person.id),
      ["another-red"],
    );
    assert.match(payload.关联背景.relationships[0].description, /小红信任小蓝；小蓝仍有顾虑/);
    assert.deepEqual(
      payload.关联背景.heldItems.map((item: { holder: { id: string } }) => item.holder.id).sort(),
      ["blue", "red"],
    );
    assert.doesNotMatch(
      JSON.stringify(payload),
      /不应递归扩展的关系|不应递归取到|无关钢笔|无关近况/,
    );
  } finally {
    data.dispose();
    memory.dispose();
  }
});
