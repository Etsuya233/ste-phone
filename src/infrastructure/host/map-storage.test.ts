import assert from "node:assert/strict";
import { test } from "node:test";
const createEmptyMapData = () => ({ version: 1 as const, maps: {} });
import { createStMapStorage } from "./map-storage.ts";
import { createStChatMetadataStorage, type StChatSaveContext } from "./chat-metadata-storage.ts";

function fixture(request: typeof fetch) {
  let activeId = "a";
  const context: StChatSaveContext = {
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
  const metadata = createStChatMetadataStorage(
    () => context,
    {
      getSnapshot: () => ({ id: activeId, name: activeId }),
      subscribe: () => () => {},
    },
    request,
  );
  const storage = createStMapStorage(metadata);
  return {
    storage,
    context,
    switchChat(id = "b") {
      activeId = id;
      context.chatId = `story-${id}`;
    },
  };
}

test("map save captures target and chat before an asynchronous chat switch", async () => {
  let finish!: (value: Response) => void;
  let sent!: { url: string; body: Record<string, unknown> };
  const { storage, context, switchChat } = fixture((async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init!.body as string) };
    return new Promise<Response>((accept) => {
      finish = accept;
    });
  }) as typeof fetch);
  const data = createEmptyMapData();
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
  await assert.rejects(storage.write("a", createEmptyMapData()), /409/);
  assert.equal(calls[0]!.url, "/api/chats/group/save");
  assert.equal(calls[0]!.body.id, "story-a");
  assert.equal(calls[0]!.body.force, false);
});

test("failed map writes leave the in-memory metadata unchanged", async () => {
  const { storage, context } = fixture(async () => new Response(null, { status: 500 }));
  const original = structuredClone(context.chatMetadata);
  await assert.rejects(storage.write("a", createEmptyMapData()), /500/);
  assert.deepEqual(context.chatMetadata, original);
  assert.equal(storage.read("a"), null);
});

test("confirmed save synchronizes replacement metadata after returning to the same chat", async () => {
  let finish!: (value: Response) => void;
  const { storage, context, switchChat } = fixture(
    async () =>
      new Promise<Response>((accept) => {
        finish = accept;
      }),
  );
  const captured = context.chatMetadata;
  const data = {
    version: 1 as const,
    maps: { scope: { title: "已保存地图", revision: 1, features: [], events: [] } },
  };
  const saving = storage.write("a", data);
  switchChat();
  const replacement = {
    integrity: "same-chat",
    ste_phone: { diary: { latest: true } },
    other_plugin: { latest: true },
  };
  Object.assign(context, { chatMetadata: replacement });
  switchChat("a");
  finish(new Response(null, { status: 200 }));
  await saving;
  assert.notEqual(context.chatMetadata, captured);
  assert.deepEqual(storage.read("a"), data);
  assert.deepEqual(context.chatMetadata.ste_phone, { diary: { latest: true }, maps: data });
  assert.deepEqual(context.chatMetadata.other_plugin, { latest: true });
  assert.deepEqual((captured.ste_phone as { maps: unknown }).maps, data);
});

test("confirmed save does not synchronize replacement metadata belonging to another chat", async () => {
  let finish!: (value: Response) => void;
  const { storage, context, switchChat } = fixture(
    async () =>
      new Promise<Response>((accept) => {
        finish = accept;
      }),
  );
  const captured = context.chatMetadata;
  const data = createEmptyMapData();
  const saving = storage.write("a", data);
  switchChat();
  const replacement = { integrity: "other-chat", ste_phone: { diary: { untouched: true } } };
  Object.assign(context, { chatMetadata: replacement });
  finish(new Response(null, { status: 200 }));
  await saving;
  assert.deepEqual(context.chatMetadata, replacement);
  assert.deepEqual(replacement.ste_phone, { diary: { untouched: true } });
  assert.deepEqual((captured.ste_phone as { maps: unknown }).maps, data);
});
