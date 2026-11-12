import assert from "node:assert/strict";
import { test } from "node:test";
import { createStChatMetadataStorage, type StChatSaveContext } from "./chat-metadata-storage.ts";
import { createStPhoneContextStorage } from "./phone-context-storage.ts";
import { createStWechatStorage } from "./wechat-storage.ts";
import type { PhoneContextData } from "../../apps/phone-context/public.ts";
import { createWechatContextSource } from "../../apps/wechat/public.ts";

const presets: PhoneContextData = {
  version: 1,
  presets: [
    {
      id: "recent",
      name: "最近聊天",
      sourceId: "wechat",
      selection: {
        scopeId: "space",
        personIds: ["a", "b"],
        recentMinutes: null,
        limitPerGroup: 50,
      },
    },
  ],
};

test("宏读取只包含已确认保存的微信，预设与微信并发保存保留双方数据", async () => {
  const response = Promise.withResolvers<Response>();
  const context: StChatSaveContext = {
    chatId: "story",
    groupId: "group",
    characters: [],
    chat: [],
    chatMetadata: { otherPlugin: "keep" },
    getRequestHeaders: () => ({}),
    eventTypes: { CHAT_CHANGED: "", CHAT_RENAMED: "", CHARACTER_RENAMED: "", GROUP_UPDATED: "" },
    eventSource: { on() {}, removeListener() {} },
  };
  let calls = 0;
  const metadata = createStChatMetadataStorage(
    () => context,
    { getSnapshot: () => ({ id: "chat", name: "story" }), subscribe: () => () => {} },
    async () => (++calls === 1 ? response.promise : new Response(null, { status: 200 })),
  );
  const storage = createStPhoneContextStorage(metadata);
  const wechat = createStWechatStorage(metadata);
  const source = createWechatContextSource(wechat);
  const writing = wechat.write("chat", {
    version: 4,
    account: null,
    conversations: [
      {
        id: '["space","a","b"]',
        people: [
          { id: "a", scopeId: "space", name: "甲" },
          { id: "b", scopeId: "space", name: "乙" },
        ],
        messages: [
          {
            id: "message",
            senderId: "a",
            content: { type: "text", text: "保存后可见" },
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
  });
  const savingPreset = storage.write("chat", presets);
  assert.equal(wechat.read("chat"), null);
  assert.equal(storage.read("chat"), null);
  response.resolve(new Response(null, { status: 200 }));
  await Promise.all([writing, savingPreset]);
  assert.equal(calls, 2);
  assert.deepEqual(storage.read("chat"), presets);
  assert.match(
    source.read({ chatId: "chat", selection: presets.presets[0]!.selection, now: Date.now() }).text,
    /保存后可见/,
  );
  assert.equal(context.chatMetadata.otherPlugin, "keep");
});

test("预设损坏与保存失败明确报错，失败不发布新的预设", async () => {
  let saved: unknown = presets;
  const storage = createStPhoneContextStorage({
    read: () => saved,
    write: async () => {
      throw new Error("保存失败（HTTP 500）");
    },
  });
  await assert.rejects(storage.write("chat", { version: 1, presets: [] }), /500/);
  assert.deepEqual(storage.read("chat"), presets);
  saved = { version: 999, presets: [] };
  assert.throws(() => storage.read("chat"), /存储格式无效/);
});
