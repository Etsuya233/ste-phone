import assert from "node:assert/strict";
import { test } from "node:test";
import { WechatIntentService } from "./wechat-intent-service.ts";
import type { WechatIntent, WechatIntentData } from "./wechat-intent.ts";
import type { WechatData } from "./wechat.ts";

const intent: WechatIntent = {
  id: "stable-intent",
  name: "两人聊天",
  selection: { scopeId: "space", personIds: ["a", "b"], recentMinutes: null, limitPerGroup: 50 },
};
function fixture() {
  let chatId = "a";
  let writing = Promise.resolve();
  const listeners = new Set<() => void>();
  const saved = new Map<string, WechatIntentData>();
  const messages: WechatData = {
    version: 6,
    account: null,
    conversations: [
      {
        id: "group",
        kind: "group",
        name: "测试群",
        description: "",
        people: [{ id: "a", scopeId: "space", name: "甲" }],
        memberIds: ["a"],
        messages: [
          {
            id: "system",
            senderId: "a",
            createdAt: "2020-01-01T00:00:00.000Z",
            content: { type: "system", text: "甲创建了群聊" },
          },
        ],
      },
      {
        id: '["space","a","b"]',
        people: [
          { id: "a", scopeId: "space", name: "甲" },
          { id: "b", scopeId: "space", name: "乙" },
        ],
        messages: [
          {
            id: "m",
            senderId: "a",
            createdAt: "2020-01-01T00:00:00.000Z",
            content: { type: "text", text: "已保存消息" },
          },
        ],
      },
    ],
  };
  const service = new WechatIntentService({
    chat: {
      getSnapshot: () => ({ id: chatId, name: chatId }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    storage: {
      read: (id) => saved.get(id) ?? null,
      write: async (id, data) => {
        await writing;
        saved.set(id, data);
      },
    },
    messageStorage: { read: () => messages, write: async () => {} },
  });
  return {
    service,
    saved,
    setWriting: (value: Promise<void>) => {
      writing = value;
    },
    switchChat: (id: string) => {
      chatId = id;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

test("微信 Intent 改名不改变引用，草稿预览不保存，删除后引用明确失效", async () => {
  const f = fixture();
  assert.match(f.service.preview(intent).text, /已保存消息/);
  assert.deepEqual(f.service.source.listIntents("a"), []);
  await f.service.save(intent);
  await f.service.save({ ...intent, name: "改名后的方案" });
  assert.deepEqual(f.service.source.listIntents("a"), [{ id: intent.id, name: "改名后的方案" }]);
  assert.match(
    f.service.source.readIntent({ chatId: "a", intentId: intent.id, now: Date.now() }),
    /已保存消息/,
  );
  await f.service.remove(intent.id);
  assert.throws(
    () => f.service.source.readIntent({ chatId: "a", intentId: intent.id, now: Date.now() }),
    /已删除或不存在/,
  );
  f.service.dispose();
});

test("微信 Intent 保存切聊天不会污染新聊天，失败保留配置并允许重试", async () => {
  const f = fixture();
  const pending = Promise.withResolvers<void>();
  f.setWriting(pending.promise);
  const writing = f.service.save(intent);
  f.switchChat("b");
  pending.resolve();
  await writing;
  assert.equal(f.service.getSnapshot().chatId, "b");
  assert.deepEqual(f.service.getSnapshot().intents, []);
  assert.throws(() => f.service.source.listIntents("a"), /聊天已变化/);
  f.switchChat("a");
  const failure = Promise.withResolvers<void>();
  f.setWriting(failure.promise);
  const rejected = assert.rejects(f.service.remove(intent.id), /写入失败/);
  failure.reject(new Error("写入失败"));
  await rejected;
  assert.deepEqual(f.service.getSnapshot().intents, [intent]);
  f.setWriting(Promise.resolve());
  await f.service.remove(intent.id);
  assert.deepEqual(f.service.getSnapshot().intents, []);
  f.service.dispose();
});

test("群聊 Intent 草稿可单独预览，保存确认后才更新引用的读取范围", async () => {
  const f = fixture();
  await f.service.save(intent);
  const groupIntent = {
    ...intent,
    selection: { ...intent.selection, personIds: [], groupIds: ["group"] },
  };
  const read = () =>
    f.service.source.readIntent({ chatId: "a", intentId: intent.id, now: Date.now() });
  assert.match(f.service.preview(groupIntent).text, /系统："甲创建了群聊"/);

  const pending = Promise.withResolvers<void>();
  f.setWriting(pending.promise);
  const writing = f.service.save(groupIntent);
  assert.match(read(), /已保存消息/);
  assert.doesNotMatch(read(), /测试群/);
  pending.resolve();
  await writing;
  assert.match(read(), /群聊 "测试群"/);
  assert.doesNotMatch(read(), /已保存消息/);
  f.service.dispose();
});
