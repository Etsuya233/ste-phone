import assert from "node:assert/strict";
import test from "node:test";
import { emptyCampus } from "../../apps/campus-community/campus-domain.ts";
import { createStCampusStorage } from "./campus-storage.ts";
import { createStChatMetadataStorage, type StChatSaveContext } from "./chat-metadata-storage.ts";

test("固定原群聊与正文，合并不同空间，失败不修改现有元数据", async () => {
  const context: StChatSaveContext = {
    chatId: "story-a",
    groupId: "group-a",

    characters: [],
    chat: [{ name: "人物", mes: "正文" }],
    chatMetadata: { integrity: "kept", ste_phone: { diary: { entries: ["kept"] } } },
    getRequestHeaders: () => ({ "Content-Type": "application/json" }),
    eventTypes: { CHAT_CHANGED: "", CHAT_RENAMED: "", CHARACTER_RENAMED: "", GROUP_UPDATED: "" },
    eventSource: { on() {}, removeListener() {} },
  };
  const other = { ...context, chatId: "story-b", chatMetadata: { integrity: "other" } };
  let active = context;
  let respond = Promise.resolve(new Response(null, { status: 200 }));
  let body: Record<string, unknown> | undefined;
  const metadata = createStChatMetadataStorage(
    () => active,
    { getSnapshot: () => ({ id: active.chatId!, name: "预览" }), subscribe: () => () => {} },
    async (url, init) => {
      assert.equal(url, "/api/chats/group/save");
      body = JSON.parse(init!.body as string);
      return respond;
    },
  );
  const storage = createStCampusStorage(metadata);
  const first = { ...emptyCampus(), appliedBatches: ["first"] };
  const second = { ...emptyCampus(), appliedBatches: ["second"] };
  await storage.write("story-a", "space-a", first);
  respond = Promise.resolve(new Response(null, { status: 409 }));
  await assert.rejects(storage.write("story-a", "space-b", second), /409/);
  assert.equal(storage.read("story-a", "space-b"), null);
  const pending = Promise.withResolvers<Response>();
  respond = pending.promise;
  const writing = storage.write("story-a", "space-b", second);
  active = other;
  pending.resolve(new Response(null, { status: 200 }));
  await writing;
  assert.deepEqual(other.chatMetadata, { integrity: "other" });
  assert.deepEqual(body, {
    id: "story-a",
    force: false,
    chat: [
      { chat_metadata: context.chatMetadata, user_name: "unused", character_name: "unused" },
      ...context.chat,
    ],
  });
  active = context;
  assert.deepEqual(storage.read("story-a", "space-a"), first);
  assert.deepEqual(storage.read("story-a", "space-b"), second);
  assert.deepEqual((context.chatMetadata.ste_phone as Record<string, unknown>).diary, {
    entries: ["kept"],
  });
});
