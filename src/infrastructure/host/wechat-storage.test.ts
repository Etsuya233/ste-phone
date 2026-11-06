import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyWechat } from "../../apps/wechat/wechat.ts";
import type { WechatData } from "../../apps/wechat/wechat.ts";
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

test("moments round-trip alongside existing metadata and invalid moments fail before sending", async () => {
  for (const groupId of [null, "group-a"]) {
    let requests = 0;
    const f = fixture((async () => {
      ++requests;
      return new Response(null, { status: 200 });
    }) as typeof fetch);
    f.context.groupId = groupId;
    const data: WechatData = {
      ...emptyWechat(),
      replyGuidance: { stable: { a: "公开表达指导" } },
      moments: {
        stable: [
          {
            id: "post",
            author: { id: "a", name: "甲", scopeId: "stable" },
            text: "分享",
            media: [
              { type: "video", description: "落日" },
              {
                type: "image",
                description: "晚霞",
                prompt: "天空",
                image: { id: "hub", imagePath: "/sky.png" },
              },
              { type: "video", description: "海浪" },
            ],
            createdAt: "2026-11-03T00:00:00.000Z",
            comments: [],
          },
        ],
      },
    };
    await f.storage.write("a", data);
    assert.deepEqual(f.storage.read("a"), data);
    assert.deepEqual((f.context.chatMetadata.ste_phone as Record<string, unknown>).diary, {
      version: 1,
      entries: ["kept"],
    });
    const invalid = {
      ...data,
      moments: { stable: [{ ...data.moments!.stable![0]!, createdAt: "bad" }] },
    };
    await assert.rejects(f.storage.write("a", invalid), /保存时间无效/);
    assert.equal(requests, 1);
    (f.context.chatMetadata.ste_phone as Record<string, unknown>).wechat = invalid;
    assert.throws(() => f.storage.read("a"), /保存时间无效/);
  }
});

test("aborting after dispatch keeps the original save and sends no second request", async () => {
  let finish!: (value: Response) => void;
  const calls: { body: Record<string, unknown>; signal: AbortSignal | null | undefined }[] = [];
  const f = fixture((async (_, init) => {
    calls.push({ body: JSON.parse(init!.body as string), signal: init!.signal });
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  }) as typeof fetch);
  const before = structuredClone(f.context.chatMetadata);
  const controller = new AbortController();
  const saving = f.storage.write("a", emptyWechat(), controller.signal);
  controller.abort();
  f.switchChat();
  finish(new Response(null, { status: 200 }));
  await saving;
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.body.file_name, "story-a");
  assert.equal(calls[0]!.signal, undefined);
  assert.deepEqual(f.context.chatMetadata, before);
});

test("pre-aborted saves do not dispatch and HTTP failures leave metadata intact", async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return new Response(null, { status: 409 });
  });
  const before = structuredClone(f.context.chatMetadata);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.storage.write("a", emptyWechat(), controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 0);
  await assert.rejects(f.storage.write("a", emptyWechat()), /409/);
  assert.equal(calls, 1);
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

test("legacy moments migrate on read and persist on explicit save for single and group chats", async () => {
  for (const groupId of [null, "group-a"]) {
    const { storage, context } = fixture(async () => new Response(null, { status: 200 }));
    context.groupId = groupId;
    const legacy = {
      ...emptyWechat(),
      version: 1,
      moments: {
        stable: [
          { type: "none" },
          { type: "images", descriptions: ["旧图片", "第二张"] },
          {
            type: "images",
            items: [
              {
                description: "新图片",
                prompt: "细节",
                image: { id: "hub", imagePath: "/image.png" },
              },
            ],
          },
          { type: "video", description: "旧视频" },
        ].map((media, index) => ({
          id: `old-${index}`,
          author: { id: "a", name: "甲", scopeId: "stable" },
          text: "旧动态",
          media,
          createdAt: "2026-11-04T00:00:00Z",
          comments: [],
        })),
      },
    };
    context.chatMetadata.ste_phone = { diary: { version: 1, entries: ["kept"] }, wechat: legacy };
    const original = structuredClone(context.chatMetadata);
    const loaded = storage.read("a")!;
    assert.deepEqual(
      loaded.moments!.stable!.map((moment) => moment.media),
      [
        [],
        [
          { type: "image", description: "旧图片" },
          { type: "image", description: "第二张" },
        ],
        [
          {
            type: "image",
            description: "新图片",
            prompt: "细节",
            image: { id: "hub", imagePath: "/image.png" },
          },
        ],
        [{ type: "video", description: "旧视频" }],
      ],
    );
    assert.deepEqual(context.chatMetadata, original);
    assert.equal(loaded.version, 3);
    await storage.write("a", loaded);
    assert.deepEqual(storage.read("a"), loaded);
    assert.deepEqual((context.chatMetadata.ste_phone as Record<string, unknown>).diary, {
      version: 1,
      entries: ["kept"],
    });
  }
});
