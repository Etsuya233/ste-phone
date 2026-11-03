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
    switchChat(id = "b") {
      activeId = id;
      context.chatId = `story-${id}`;
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

test("reply guidance round-trips through chat metadata for single and group chats", async () => {
  for (const groupId of [null, "group-a"]) {
    let body!: { chat: { chat_metadata: { ste_phone: { wechat: unknown; diary: unknown } } }[] };
    const f = fixture((async (_, init) => {
      body = JSON.parse(init!.body as string);
      return new Response(null, { status: 200 });
    }) as typeof fetch);
    f.context.groupId = groupId;
    const data = {
      ...emptyWechat(),
      replyGuidance: { "stable-scope": { person: "多用 Emoji 😊\n更傲娇一些" } },
    };
    await f.storage.write("a", data);
    assert.deepEqual(body.chat[0]!.chat_metadata.ste_phone.wechat, data);
    assert.deepEqual(body.chat[0]!.chat_metadata.ste_phone.diary, {
      version: 1,
      entries: ["kept"],
    });
    assert.deepEqual(f.storage.read("a"), data);
  }
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

test("confirmed save refreshes a reloaded same-target metadata object without replacing other fields", async () => {
  let finish!: (value: Response) => void;
  const f = fixture(
    (async () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })) as typeof fetch,
  );
  const data = { ...emptyWechat(), replyGuidance: { stable: { person: "确认的新值" } } };
  const writing = f.storage.write("a", data);
  f.switchChat();
  const reloaded = {
    integrity: "new-integrity",
    another_plugin: { value: 42 },
    ste_phone: { diary: { version: 1, entries: ["new diary"] } },
  };
  Object.assign(f.context, { chatMetadata: reloaded });
  f.switchChat("a");
  finish(new Response(null, { status: 200 }));
  await writing;
  assert.deepEqual(f.storage.read("a"), data);
  assert.equal(f.context.chatMetadata.integrity, "new-integrity");
  assert.deepEqual(f.context.chatMetadata.another_plugin, { value: 42 });
  assert.deepEqual((f.context.chatMetadata.ste_phone as Record<string, unknown>).diary, {
    version: 1,
    entries: ["new diary"],
  });
});

test("an older acknowledgement cannot replay its metadata over a later write", async () => {
  let finish!: (value: Response) => void;
  let calls = 0;
  const f = fixture((async () => {
    if (++calls === 1) {
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch);
  const old = f.storage.write("a", emptyWechat());
  const newer = { ...emptyWechat(), replyGuidance: { stable: { person: "newest" } } };
  await f.storage.write("a", newer);
  finish(new Response(null, { status: 200 }));
  await old;
  assert.deepEqual(f.storage.read("a"), newer);
});
