import assert from "node:assert/strict";
import { before, test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { BackgroundDataSource } from "../../features/background/index.ts";
import type { PhoneBackground, SourceContext } from "../../features/background/index.ts";
import type { DatabaseEngine } from "../../features/database/index.ts";
import { PhoneDatabaseService } from "../../features/database/index.ts";
import { SqliteDatabase } from "./engine.ts";
import { mapMemoryBackground } from "../ste-memory/map-background.ts";
import { mapMemoryDatabase } from "../ste-memory/map-database.ts";
import { memorySnapshotFixture } from "../../../tests/fixtures/memory-snapshot.ts";

let sqlite: Sqlite3Static;
before(async () => {
  sqlite = await sqlite3InitModule();
});

function fixture() {
  const snapshot = memorySnapshotFixture();
  const background = mapMemoryBackground(snapshot);
  let data: PhoneBackground = { ...background, database: mapMemoryDatabase(snapshot, background) };
  let context: SourceContext = {
    sourceName: "fixture",
    chatIdentity: "chat-a",
    chatName: "A",
    scopeId: snapshot.space.id,
    spaceName: snapshot.space.name,
    available: true,
    message: null,
  };
  const listeners = new Set<() => void>();
  let reads = 0;
  let failRead = false;
  let failReplace = false;
  let delayQuery: (() => Promise<void>) | null = null;
  const source = new BackgroundDataSource({
    getContext: () => context,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read: async () => {
      reads++;
      if (failRead) throw new Error("source read failed");
      return data;
    },
  });
  const engine = new SqliteDatabase(sqlite);
  const adapter: DatabaseEngine = {
    async replace(binding, snapshot) {
      if (failReplace) throw new Error("candidate import failed");
      engine.replace(binding, snapshot);
    },
    async query(binding, sql, params) {
      const result = engine.query(binding, sql, { params });
      const delay = delayQuery;
      delayQuery = null;
      if (delay) await delay();
      return result;
    },
    dispose() {
      engine.dispose();
    },
  };
  const database = new PhoneDatabaseService(source, adapter);
  return {
    source,
    database,
    get reads() {
      return reads;
    },
    set failRead(value: boolean) {
      failRead = value;
    },
    set failReplace(value: boolean) {
      failReplace = value;
    },
    set delayQuery(value: (() => Promise<void>) | null) {
      delayQuery = value;
    },
    change(chat = context.chatIdentity!, scope = context.scopeId!) {
      context = { ...context, chatIdentity: chat, scopeId: scope };
      data = { ...data, scopeId: scope, database: { ...data.database!, scopeId: scope } };
      for (const listener of listeners) listener();
    },
    dispose() {
      database.dispose();
      source.dispose();
    },
  };
}

test("database and background apps share one source read, inactive database does not reload, and SQL drafts persist per chat", async () => {
  const f = fixture();
  const unsubscribe = f.database.subscribe(() => {});
  await Promise.all([f.source.load(), f.database.load()]);
  assert.equal(f.reads, 1);
  f.database.edit({
    sql: "SELECT :id",
    search: "characters",
    selected: "phone_characters",
    tab: "sql",
  });
  assert.deepEqual((await f.database.query("SELECT :id", { id: "red" })).rows, [["red"]]);
  unsubscribe();
  f.change();
  assert.equal(f.reads, 1);
  const again = f.database.subscribe(() => {});
  await f.database.load();
  assert.equal(f.database.getState().editor.sql, "SELECT :id");
  f.change("chat-b", "other-space");
  assert.equal(f.database.getState().snapshot, null);
  assert.notEqual(f.database.getState().editor.sql, "SELECT :id");
  await f.database.load();
  f.change("chat-a", "preview-space");
  await f.database.load();
  assert.equal(f.database.getState().editor.search, "characters");
  assert.equal(f.database.getState().editor.selected, "phone_characters");
  again();
  f.dispose();
});

test("failed imports and reads preserve same-binding cache with errors, and a subsequent refresh can recover", async () => {
  const f = fixture();
  const unsubscribe = f.database.subscribe(() => {});
  await f.database.load();
  const previous = f.database.getState().snapshot;
  f.failReplace = true;
  f.change();
  await assert.rejects(f.database.load(), /candidate import failed/);
  assert.equal(f.database.getState().snapshot, previous);
  assert.equal(f.database.getState().stale, true);
  assert.match(f.database.getState().error!, /candidate import failed/);
  assert.equal(f.database.getState().status, "error");
  f.failReplace = false;
  await f.database.load();
  assert.equal(f.database.getState().status, "ready");
  assert.equal(f.database.getState().error, null);
  f.failRead = true;
  await assert.rejects(f.database.load(true), /source read failed/);
  assert.equal(f.database.getState().stale, true);
  assert.match(f.database.getState().error!, /source read failed/);
  f.change("chat-b", "other-space");
  assert.equal(f.database.getState().snapshot, null);
  await assert.rejects(f.database.query("SELECT 1"), /source read failed/);
  f.failRead = false;
  await f.database.load(true);
  assert.equal(f.database.getState().status, "ready");
  unsubscribe();
  f.dispose();
});

test("late query results cannot cross A to B to A and the restored editor always leaves running state", async () => {
  const f = fixture();
  const unsubscribe = f.database.subscribe(() => {});
  await f.database.load();
  let finish!: () => void;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.delayQuery = () => {
    started();
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  f.database.edit({ sql: "SELECT 'old A'" });
  const old = f.database.execute();
  await begun;
  f.change("chat-b");
  await f.database.load();
  assert.equal(f.database.getState().editor.result, null);
  f.change("chat-a");
  await f.database.load();
  assert.equal(f.database.getState().editor.running, true);
  finish();
  await old;
  assert.equal(f.database.getState().editor.running, false);
  assert.equal(f.database.getState().editor.result, null);
  assert.equal(f.database.getState().editor.queryError, null);
  f.database.edit({ sql: "SELECT 'new A'" });
  await f.database.execute();
  assert.deepEqual(f.database.getState().editor.result!.rows, [["new A"]]);
  unsubscribe();
  f.dispose();
});
