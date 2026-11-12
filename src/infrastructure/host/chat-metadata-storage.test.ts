import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyDiary } from "../../apps/diary/diary.ts";
import { createStCharacterOverrideStorage } from "./character-override-storage.ts";
import { createStDiaryStorage } from "./diary-storage.ts";
import { createStChatMetadataStorage, type StChatSaveContext } from "./chat-metadata-storage.ts";

const overrides = { version: 1 as const, spaces: { stable: { person: { name: "小夏" } } } };

function fixture() {
  const firstResponse = Promise.withResolvers<Response>();
  const calls: {
    id: string;
    force: boolean;
    chat: [{ chat_metadata: Record<string, unknown> }, ...unknown[]];
  }[] = [];
  const context: StChatSaveContext = {
    chatId: "story",
    groupId: "group",
    characters: [],
    chat: [{ name: "人物", mes: "原始正文" }],
    chatMetadata: { integrity: "original", otherPlugin: { value: 1 } },
    getRequestHeaders: () => ({ "Content-Type": "application/json" }),
    eventTypes: { CHAT_CHANGED: "", CHAT_RENAMED: "", CHARACTER_RENAMED: "", GROUP_UPDATED: "" },
    eventSource: { on() {}, removeListener() {} },
  };
  const metadata = createStChatMetadataStorage(
    () => context,
    { getSnapshot: () => ({ id: "host-chat-id", name: "story" }), subscribe: () => () => {} },
    async (url, init) => {
      assert.equal(url, "/api/chats/group/save");
      calls.push(JSON.parse(init!.body as string));
      return calls.length === 1 ? firstResponse.promise : new Response(null, { status: 200 });
    },
  );
  return {
    context,
    calls,
    firstResponse,
    diary: createStDiaryStorage(metadata),
    characters: createStCharacterOverrideStorage(metadata),
  };
}

test("人物资料和日记并发保存时串行合并同一聊天的最新元数据", async () => {
  const { context, calls, firstResponse, diary, characters } = fixture();
  const entry = createEmptyDiary();
  const savingCharacter = characters.write("host-chat-id", overrides);
  const savingDiary = diary.write("host-chat-id", entry);
  assert.equal(calls.length, 1);
  assert.equal(characters.read("host-chat-id"), undefined);
  context.chatMetadata.otherPlugin = { value: 2 };
  firstResponse.resolve(new Response(null, { status: 200 }));
  await Promise.all([savingCharacter, savingDiary]);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    id: "story",
    force: false,
    chat: [
      {
        chat_metadata: {
          integrity: "original",
          otherPlugin: { value: 2 },
          ste_phone: { characterOverrides: overrides, diary: entry },
        },
        user_name: "unused",
        character_name: "unused",
      },
      ...context.chat,
    ],
  });
  assert.deepEqual(characters.read("host-chat-id"), overrides);
  assert.deepEqual(diary.read("host-chat-id"), entry);
});

test("队列前一项失败后，提交前仍校验编辑归属并允许新的保存", async () => {
  const { calls, firstResponse, diary, characters } = fixture();
  const first = diary.write("host-chat-id", createEmptyDiary());
  let current = true;
  const stale = characters.write("host-chat-id", overrides, () => {
    if (!current) {
      throw new Error("资料实例已变化");
    }
  });
  assert.equal(calls.length, 1);
  current = false;
  const checkFailure = assert.rejects(first, /409/);
  const checkStale = assert.rejects(stale, /资料实例已变化/);
  firstResponse.resolve(new Response(null, { status: 409 }));
  await Promise.all([checkFailure, checkStale]);
  assert.equal(calls.length, 1);
  assert.equal(diary.read("host-chat-id"), null);
  assert.equal(characters.read("host-chat-id"), undefined);
  await characters.write("host-chat-id", overrides);
  assert.equal(calls.length, 2);
  assert.deepEqual(characters.read("host-chat-id"), overrides);
});
