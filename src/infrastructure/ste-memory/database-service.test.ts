import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryDatabaseFixture } from "../../../tests/fixtures/memory-database.ts";
import { MemoryDatabaseProvider } from "./memory-database-provider.ts";
import { MemoryBackgroundProvider } from "./memory-background-provider.ts";
import { BackgroundDataSource } from "../../features/background/index.ts";
import { PhoneDatabaseService } from "../../features/database/index.ts";

function fixture() {
  const memory = memoryDatabaseFixture();
  memory.install();
  const provider = new MemoryDatabaseProvider();
  const database = new PhoneDatabaseService(provider);
  const source = new BackgroundDataSource(new MemoryBackgroundProvider(database, provider));
  return {
    memory,
    database,
    source,
    dispose() {
      source.dispose();
      database.dispose();
      memory.dispose();
    },
  };
}

test("data notifications mark results stale without reading records or rebuilding views", async () => {
  const f = fixture();
  try {
    await f.database.load();
    await f.database.execute();
    assert.equal(f.memory.stats.registrations, 1);
    const describes = f.memory.stats.describes;
    f.memory.db.exec("UPDATE characters SET name='新名字' WHERE \"$record_id\"='red'");
    f.memory.change();
    assert.equal(f.database.getState().editor.resultStale, true);
    assert.equal(f.memory.stats.describes, describes);
    assert.equal(f.memory.stats.registrations, 1);
    const current = await f.database.query(
      "SELECT name FROM phone_characters WHERE record_id = :id",
      { id: "red" },
    );
    assert.equal(current.rows[0]![0], "新名字");
    assert.equal(f.memory.stats.registrations, 1);
    assert.equal(f.memory.stats.reads, 0);
    f.memory.setDescription({ ...f.memory.description, schemaKey: "schema-v2" });
    f.memory.change();
    await f.database.load();
    assert.equal(f.memory.stats.registrations, 2);
    await f.database.execute();
    assert.equal(f.database.getState().editor.resultStale, false);
  } finally {
    f.dispose();
  }
});

test("late query responses are discarded across chats sharing a scope and editor sessions restore", async () => {
  const f = fixture();
  try {
    await f.database.load();
    f.database.edit({
      sql: "SELECT name FROM phone_characters",
      search: "人物",
      scroll: { sql: 42 },
    });
    let release!: () => void;
    f.memory.deferQuery(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const old = f.database.execute();
    await new Promise((resolve) => setImmediate(resolve));
    f.memory.change({ chatIdentity: "chat-b", chatName: "B" });
    f.database.edit({ sql: "SELECT 2", search: "B" });
    release();
    await old;
    assert.equal(f.database.getState().editor.result, null);
    assert.equal(f.database.getState().editor.sql, "SELECT 2");
    f.memory.change({ chatIdentity: "chat-a", chatName: "A" });
    assert.equal(f.database.getState().editor.search, "人物");
    assert.equal(f.database.getState().editor.scroll.sql, 42);
    assert.equal(f.database.getState().editor.running, false);
  } finally {
    f.dispose();
  }
});

test("background queries paginate complete required data and never query custom-table records", async () => {
  const f = fixture();
  try {
    const insert = f.memory.db.prepare(
      'INSERT INTO characters ("$record_id","$created_at",name,personality,background,current_status) VALUES(?,?,?,?,?,?)',
    );
    for (let index = 0; index < 405; index++)
      insert.run(`extra-${index}`, "2026-10-30", `人物${index}`, "性格", "经历", "近况");
    const data = await f.source.load();
    assert.equal(data.characters.length, 408);
    assert.match(data.items[0]!.description, /小蓝/);
    assert.equal(
      f.memory.stats.queries.filter((sql) => sql.includes("FROM phone_characters")).length,
      3,
    );
    assert.equal(
      f.memory.stats.queries.some((sql) => sql.includes("custom_notes")),
      false,
    );
    assert.equal(f.memory.stats.reads, 0);
    const queries = f.memory.stats.queries.length;
    f.memory.change();
    assert.equal(f.source.getState().stale, true);
    assert.equal(f.memory.stats.queries.length, queries);
  } finally {
    f.dispose();
  }
});

test("missing database capability is explicit and leaves legacy read unused", async () => {
  const memory = memoryDatabaseFixture();
  memory.install();
  globalThis.STE_MEMORY_API = { ...memory.api, database: undefined };
  const provider = new MemoryDatabaseProvider();
  assert.equal(provider.getContext().available, false);
  assert.match(provider.getContext().message!, /database v1/);
  await assert.rejects(provider.describe(), /database v1/);
  assert.equal(memory.stats.reads, 0);
  memory.dispose();
});

test("database reload and A to B to A register again even when schema is unchanged", async () => {
  const f = fixture();
  try {
    await f.database.load();
    f.memory.setDescription({ ...f.memory.description, databaseKey: "db-reloaded" });
    f.memory.change();
    await f.database.load();
    assert.equal(f.memory.stats.registrations, 2);
    f.memory.change({ chatIdentity: "chat-b" });
    f.memory.setDescription({ ...f.memory.description, databaseKey: "db-b" });
    await f.database.load();
    f.memory.change({ chatIdentity: "chat-a" });
    f.memory.setDescription({ ...f.memory.description, databaseKey: "db-a-loaded-again" });
    await f.database.load();
    assert.equal(f.memory.stats.registrations, 4);
  } finally {
    f.dispose();
  }
});
