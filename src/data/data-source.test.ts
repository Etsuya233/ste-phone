import assert from "node:assert/strict";
import { test } from "node:test";
import { BackgroundDataSource } from "./data-source.ts";
import type { BackgroundProvider, PhoneBackground, SourceContext } from "./background.ts";

const data = (scopeId = "space", name = "小红"): PhoneBackground => ({
  sourceId: "test",
  scopeId,
  characters: [{ id: "red", name, profileText: "人物资料" }],
  chronicles: [],
  items: [],
});

function fixture() {
  let context: SourceContext = {
    sourceName: "test",
    chatIdentity: "chat",
    chatName: "聊天",
    scopeId: "space",
    spaceName: "空间",
    available: true,
    message: null,
  };
  const listeners = new Set<() => void>();
  const pending: { resolve: (data: PhoneBackground) => void; reject: (error: Error) => void }[] =
    [];
  const provider: BackgroundProvider = {
    getContext: () => context,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  const source = new BackgroundDataSource(provider);
  return {
    source,
    pending,
    change(next?: Partial<SourceContext>, notify = true) {
      context = { ...context, ...next };
      if (notify) for (const listener of listeners) listener();
    },
  };
}

test("cache is shared, force refresh replaces snapshots without mutating held inputs", async () => {
  const f = fixture();
  const first = f.source.load();
  assert.equal(f.source.load(), first);
  f.pending[0]!.resolve(data());
  const original = await first;
  assert.equal(await f.source.load(), original);
  const refresh = f.source.load({ force: true });
  f.pending[1]!.resolve(data("space", "红"));
  assert.equal((await refresh).characters[0]!.name, "红");
  assert.equal(original.characters[0]!.name, "小红");
  f.source.dispose();
});

test("cached reads check current binding before the chat-change notification arrives", async () => {
  const f = fixture();
  const first = f.source.load();
  f.pending[0]!.resolve(data());
  await first;
  f.change({ chatIdentity: "another-chat" }, false);
  const next = f.source.load();
  assert.equal(f.source.getState().data, null);
  f.pending[1]!.resolve(data("space", "新聊天人物"));
  assert.equal((await next).characters[0]!.name, "新聊天人物");
  f.source.dispose();
});

test("late reads cannot cross chats, including chats sharing one memory space", async () => {
  const f = fixture();
  const old = f.source.load();
  const rejected = assert.rejects(old, /聊天已变化/);
  f.change({ chatIdentity: "another-chat" });
  const latest = f.source.load();
  f.pending[1]!.resolve(data("space", "新聊天人物"));
  await latest;
  f.pending[0]!.resolve(data());
  await rejected;
  assert.equal(f.source.getState().data!.characters[0]!.name, "新聊天人物");
  f.source.dispose();
});

test("invalidation during a same-chat read rejects stale output and reloads for observers", async () => {
  const f = fixture();
  const unsubscribe = f.source.subscribe(() => {});
  const old = f.source.load();
  const rejected = assert.rejects(old, /资料或聊天已变化/);
  f.change();
  f.pending[0]!.resolve(data());
  await rejected;
  assert.equal(f.source.getState().data, null);
  assert.equal(f.source.getState().status, "loading");
  f.pending[1]!.resolve(data("space", "更新人物"));
  await f.source.load();
  assert.equal(f.source.getState().data!.characters[0]!.name, "更新人物");
  unsubscribe();
  f.source.dispose();
});

test("refresh failure keeps only same-context stale data; disconnect clears it", async () => {
  const f = fixture();
  const first = f.source.load();
  f.pending[0]!.resolve(data());
  await first;
  const refresh = f.source.load({ force: true });
  f.pending[1]!.reject(new Error("字段缺失"));
  await assert.rejects(refresh, /字段缺失/);
  assert.equal(f.source.getState().stale, true);
  assert.equal(f.source.getState().status, "error");
  assert.equal(f.source.getState().data!.characters.length, 1);
  f.change({ available: false, scopeId: null, message: "空间未就绪" });
  assert.equal(f.source.getState().data, null);
  await assert.rejects(f.source.load(), /空间未就绪/);
  f.source.dispose();
});
