import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyDiary } from "../../apps/diary/diary.ts";
import { createStDiaryStorage, type StDiaryContext } from "./diary-storage.ts";

function fixture(request: typeof fetch) {
  let activeId = "a";
  const context: StDiaryContext = {
    chatId: "story-a",
    characterId: 0,
    groupId: null,
    characters: [{ avatar: "alice.png", name: "Alice" }],
    chat: [{ name: "Alice", mes: "Story" }],
    chatMetadata: { integrity: "kept", another_plugin: { value: 1 } },
    getRequestHeaders: () => ({ "Content-Type": "application/json" }),
    eventTypes: { CHAT_CHANGED: "", CHAT_RENAMED: "", CHARACTER_RENAMED: "", GROUP_UPDATED: "" },
    eventSource: { on() {}, removeListener() {} },
  };
  const storage = createStDiaryStorage(
    () => context,
    {
      getSnapshot: () => ({ id: activeId, name: activeId }),
      subscribe: () => () => {},
    },
    request,
  );
  return {
    storage,
    context,
    switchChat() {
      activeId = "b";
      context.chatId = "story-b";
    },
  };
}

test("diary save captures target and chat before an asynchronous chat switch", async () => {
  let finish!: (value: Response) => void;
  let sent!: { url: string; body: Record<string, unknown> };
  const { storage, context, switchChat } = fixture((async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init!.body as string) };
    return new Promise<Response>((accept) => {
      finish = accept;
    });
  }) as typeof fetch);
  const data = createEmptyDiary();
  const saving = storage.write("a", data);
  switchChat();
  context.chatMetadata.another_plugin = { value: 2 };
  finish(new Response(null, { status: 200 }));
  await saving;
  assert.equal(sent.url, "/api/chats/save");
  assert.equal(sent.body.file_name, "story-a");
  assert.equal(sent.body.avatar_url, "alice.png");
  assert.equal(sent.body.force, false);
  const rows = sent.body.chat as { chat_metadata: Record<string, unknown> }[];
  assert.equal(rows[0]!.chat_metadata.integrity, "kept");
  assert.deepEqual(rows[0]!.chat_metadata.another_plugin, { value: 1 });
  await assert.rejects(storage.write("a", data), /聊天已变化/);
});

test("group save uses the group endpoint and HTTP errors remain observable", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const { storage, context } = fixture((async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
    return new Response(null, { status: 409 });
  }) as typeof fetch);
  context.groupId = "group-a";
  await assert.rejects(storage.write("a", createEmptyDiary()), /409/);
  assert.equal(calls[0]!.url, "/api/chats/group/save");
  assert.equal(calls[0]!.body.id, "story-a");
  assert.equal(calls[0]!.body.force, false);
});

test("failed diary writes leave the in-memory metadata unchanged", async () => {
  const { storage, context } = fixture(async () => new Response(null, { status: 500 }));
  const original = structuredClone(context.chatMetadata);
  await assert.rejects(storage.write("a", createEmptyDiary()), /500/);
  assert.deepEqual(context.chatMetadata, original);
  assert.equal(storage.read("a"), null);
});

test("legacy settings disable automatic images and invalid references fail explicitly", () => {
  const { storage, context } = fixture(async () => new Response(null, { status: 200 }));
  const data = createEmptyDiary();
  context.chatMetadata.ste_phone = {
    diary: {
      ...data,
      version: 1,
      settings: { timeoutSeconds: 300, maxTokens: 10240 },
      entries: [{ image: { id: "hub", imagePath: "/old.png" } }],
    },
  };
  const migrated = storage.read("a")!;
  assert.equal(migrated.settings.autoGenerateImage, false);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.entries[0]!.image, { source: "hub", id: "hub", imagePath: "/old.png" });
  context.chatMetadata.ste_phone = { diary: { ...data, entries: [{ image: { id: "bad" } }] } };
  assert.throws(() => storage.read("a"), /配图引用无效/);
});
