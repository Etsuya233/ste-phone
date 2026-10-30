import assert from "node:assert/strict";
import { before, test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { memorySnapshotFixture } from "../../../tests/fixtures/memory-snapshot.ts";
import { mapMemoryBackground } from "../ste-memory/map-background.ts";
import { mapMemoryDatabase } from "../ste-memory/map-database.ts";
import { SqliteDatabase } from "./engine.ts";

let sqlite: Sqlite3Static;
before(async () => {
  sqlite = await sqlite3InitModule();
});

test("real WASM imports all source structure, typed fields, original JSON, stable views and reference joins", () => {
  const engine = new SqliteDatabase(sqlite);
  const snapshot = memorySnapshotFixture();
  const model = mapMemoryDatabase(snapshot, mapMemoryBackground(snapshot));
  engine.replace("chat-a", model);
  assert.equal(model.schemaVersion, 1);
  assert.deepEqual(
    engine.query(
      "chat-a",
      "SELECT score,typeof(score),count,typeof(count),active,day,tags,archived FROM src_custom_notes",
    ).rows,
    [[9.5, "real", 2, "integer", 1, "2026-10-30", '["线索","校园"]', "停用字段仍保留"]],
  );
  const original = engine.query(
    "chat-a",
    "SELECT _phone_payload_json,_phone_record_json FROM src_characters WHERE _phone_record_id=:id",
    { params: { id: "red" } },
  ).rows[0]!;
  assert.deepEqual(JSON.parse(original[0] as string), snapshot.records[0]!.payload);
  assert.deepEqual(JSON.parse(original[1] as string), snapshot.records[0]);
  assert.equal(
    engine.query("chat-a", "SELECT count(*) FROM phone_source_fields").rows[0]![0],
    snapshot.fields.length,
  );
  assert.deepEqual(
    engine.query("chat-a", "SELECT date(world_time),current_location FROM phone_world_state").rows,
    [["2026-10-30", "学校图书馆"]],
  );
  assert.deepEqual(
    engine.query("chat-a", 'SELECT date("current_time") FROM src_story_state').rows,
    [["2026-10-30"]],
  );
  assert.deepEqual(
    engine.query(
      "chat-a",
      "SELECT c.name FROM phone_chronicle_characters l JOIN phone_characters c ON c.record_id=l.character_id AND c.scope_id=l.scope_id AND c.source_id=l.source_id WHERE l.chronicle_id='event-1' ORDER BY c.name",
    ).rows,
    [["小红"], ["小蓝"]],
  );
  assert.equal(
    engine.query("chat-a", "SELECT count(*) FROM src_characters,json_each(src_characters.aliases)")
      .rows[0]![0],
    1,
  );
  assert.deepEqual(
    engine.query(
      "chat-a",
      "SELECT source_id,scope_id,record_id FROM phone_characters WHERE record_id='red'",
    ).rows,
    [["ste-memory", "preview-space", "red"]],
  );
  assert.match(
    engine.query("chat-a", "SELECT profile_text FROM phone_characters WHERE record_id='red'")
      .rows[0]![0] as string,
    /personality：直率/,
  );
  engine.dispose();
});

test("real WASM authorizer rejects mutations, metadata, dangerous functions, PRAGMA and additional statements, then recovers", () => {
  const engine = new SqliteDatabase(sqlite);
  const snapshot = memorySnapshotFixture();
  engine.replace("chat-a", mapMemoryDatabase(snapshot, mapMemoryBackground(snapshot)));
  for (const sql of [
    "DELETE FROM src_characters",
    "UPDATE src_characters SET name='changed' RETURNING name",
    "CREATE TABLE bad(id)",
    "PRAGMA table_info(src_characters)",
    "SELECT * FROM sqlite_schema",
    "SELECT * FROM sqlite_master",
    "SELECT * FROM pragma_table_info('src_characters')",
    "ATTACH ':memory:' AS other",
    "SELECT load_extension('x')",
    "SELECT 1; SELECT 2",
    "SELECT 1; DELETE FROM src_characters",
    "SELECT 1\0; DELETE FROM src_characters",
  ]) {
    assert.throws(() => engine.query("chat-a", sql), Error, sql);
  }
  assert.deepEqual(
    engine.query(
      "chat-a",
      "-- native statement boundaries\n SELECT ';' AS value; -- trailing comment",
    ).rows,
    [[";"]],
  );
  assert.deepEqual(engine.query("chat-a", "SELECT typeof(random())").rows, [["integer"]]);
  assert.throws(() => engine.query("chat-a", "SELECT :id"), /缺少绑定/);
  assert.throws(
    () => engine.query("chat-a", "SELECT :id", { params: { id: "red", unused: 1 } }),
    /未使用/,
  );
  assert.deepEqual(
    engine.query("chat-a", "SELECT :id,:value,:empty", {
      params: { id: "'); DELETE FROM src_characters; --", value: 2, empty: null },
    }).rows,
    [["'); DELETE FROM src_characters; --", 2, null]],
  );
  assert.deepEqual(engine.query("chat-a", "SELECT count(*) FROM phone_characters").rows, [[3]]);
  engine.dispose();
});

test("real WASM enforces row caps and execution budget, atomically replaces successful databases and guards scope", () => {
  const engine = new SqliteDatabase(sqlite);
  const snapshot = memorySnapshotFixture();
  const model = mapMemoryDatabase(snapshot, mapMemoryBackground(snapshot));
  engine.replace("chat-a", model);
  const many = engine.query(
    "chat-a",
    "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<201) SELECT x FROM n",
  );
  assert.equal(many.rows.length, 200);
  assert.equal(many.truncated, true);
  assert.equal(
    engine.query(
      "chat-a",
      "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200) SELECT x FROM n",
    ).truncated,
    false,
  );
  assert.throws(
    () =>
      engine.query(
        "chat-a",
        "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n",
        { budgetMs: 10 },
      ),
    /超时/,
  );
  assert.throws(() => engine.query("chat-a", "SELECT randomblob(10000000)"), /too big/);
  assert.deepEqual(engine.query("chat-a", "SELECT 42").rows, [[42]]);
  assert.throws(
    () =>
      engine.replace("chat-a", {
        ...model,
        objects: [
          ...model.objects,
          {
            name: "bad",
            kind: "view",
            description: "broken",
            columns: [],
            select: "SELECT missing FROM missing_table",
          },
        ],
      }),
    /no such table/,
  );
  assert.deepEqual(engine.query("chat-a", "SELECT count(*) FROM phone_characters").rows, [[3]]);
  assert.throws(() => engine.query("chat-b", "SELECT 1"), /尚未就绪/);
  engine.replace("chat-b", { ...model, scopeId: "other", name: "renamed" });
  assert.throws(() => engine.query("chat-a", "SELECT 1"), /尚未就绪/);
  assert.deepEqual(engine.query("chat-b", "SELECT 1").rows, [[1]]);
  engine.dispose();
});

test("custom schemas remain queryable; unsupported standard views have empty typed schema and explicit capability", () => {
  const engine = new SqliteDatabase(sqlite);
  const snapshot = memorySnapshotFixture();
  const custom = {
    ...snapshot,
    tables: snapshot.tables.filter((table) => table.key === "custom_notes"),
    fields: snapshot.fields.filter((field) => field.tableId === "table-custom_notes"),
    records: snapshot.records.filter((record) => record.tableId === "table-custom_notes"),
  };
  const background = {
    sourceId: "ste-memory",
    scopeId: custom.space.id,
    characters: [],
    chronicles: [],
    items: [],
    backgroundError: "缺少启用的 characters 表",
  };
  engine.replace("chat-a", mapMemoryDatabase(custom, background));
  assert.deepEqual(engine.query("chat-a", "SELECT title FROM src_custom_notes").rows, [
    ["朗读会准备"],
  ]);
  assert.deepEqual(
    engine.query(
      "chat-a",
      "SELECT status FROM phone_capabilities WHERE object_name='phone_world_state'",
    ).rows,
    [["unsupported"]],
  );
  const world = engine.query("chat-a", "SELECT * FROM phone_world_state");
  assert.ok(world.columns.includes("world_time"));
  assert.equal(world.rows.length, 0);
  assert.deepEqual(
    engine.query(
      "chat-a",
      "SELECT status,detail FROM phone_capabilities WHERE object_name='background_display'",
    ).rows,
    [["error", background.backgroundError]],
  );
  engine.dispose();
});
