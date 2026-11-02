import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyWechat } from "../../apps/wechat/wechat.ts";
import { createStWechatStorage, type StWechatContext } from "./wechat-storage.ts";

function fixture(request: typeof fetch) {
  let activeId = "a";
  const context: StWechatContext = {
    chatId: "story-a",
    characterId: 0,
    groupId: null,
    characters: [{ avatar: "alice.png", name: "Alice" }],
    chat: [{ name: "Alice", mes: "Story" }],
    chatMetadata: {
      integrity: "kept",
      another_plugin: { value: 1 },
      ste_phone: { diary: { version: 1, entries: ["kept"] } },
    },
    getRequestHeaders: () => ({ "Content-Type": "application/json" }),
    eventTypes: { CHAT_CHANGED: "", CHAT_RENAMED: "", CHARACTER_RENAMED: "", GROUP_UPDATED: "" },
    eventSource: { on() {}, removeListener() {} },
  };
  const storage = createStWechatStorage(
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

test("wechat save captures target and chat before an asynchronous chat switch", async () => {
  let finish!: (value: Response) => void;
  let sent!: { url: string; body: Record<string, unknown> };
  const { storage, context, switchChat } = fixture((async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init!.body as string) };
    return new Promise<Response>((accept) => {
      finish = accept;
    });
  }) as typeof fetch);
  const data = emptyWechat();
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
  assert.deepEqual((rows[0]!.chat_metadata.ste_phone as Record<string, unknown>).diary, {
    version: 1,
    entries: ["kept"],
  });
  assert.deepEqual((rows[0]!.chat_metadata.ste_phone as Record<string, unknown>).wechat, data);
  await assert.rejects(storage.write("a", data), /聊天已变化/);
});

test("group save uses the group endpoint and HTTP errors remain observable", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const { storage, context } = fixture((async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
    return new Response(null, { status: 409 });
  }) as typeof fetch);
  context.groupId = "group-a";
  await assert.rejects(storage.write("a", emptyWechat()), /409/);
  assert.equal(calls[0]!.url, "/api/chats/group/save");
  assert.equal(calls[0]!.body.id, "story-a");
  assert.equal(calls[0]!.body.force, false);
});

test("canceling an acknowledged save rolls back the captured target after chat switch", async () => {
  let finish!: (value: Response) => void;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const f = fixture((async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
    if (calls.length === 1) {
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch);
  const before = structuredClone(f.context.chatMetadata);
  const controller = new AbortController();
  const saving = f.storage.write("a", emptyWechat(), controller.signal);
  controller.abort();
  f.switchChat();
  finish(new Response(null, { status: 200 }));
  await assert.rejects(saving, { name: "AbortError" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.body.file_name, "story-a");
  assert.deepEqual((calls[1]!.body.chat as { chat_metadata: unknown }[])[0]!.chat_metadata, before);
  assert.deepEqual(f.context.chatMetadata, before);
});

test("failed rollback remains an observable error and failed saves do not mutate host metadata", async () => {
  const controller = new AbortController();
  let calls = 0;
  const f = fixture((async () => {
    calls++;
    controller.abort();
    return new Response(null, { status: calls === 1 ? 200 : 409 });
  }) as typeof fetch);
  const before = structuredClone(f.context.chatMetadata);
  await assert.rejects(f.storage.write("a", emptyWechat(), controller.signal), /撤回保存失败/);
  assert.deepEqual(f.context.chatMetadata, before);
});
