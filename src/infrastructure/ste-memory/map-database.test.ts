import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryDatabaseFixture } from "../../../tests/fixtures/memory-database.ts";
import { mapMemoryDatabase } from "./map-database.ts";
import { memorySnapshotFixture } from "../../../tests/fixtures/memory-snapshot.ts";

test("generated views execute directly on source tables, with current references, raw JSON and world date", async () => {
  const f = memoryDatabaseFixture();
  try {
    const schema = mapMemoryDatabase(f.description);
    assert.equal(
      schema.objects.every((object) => object.kind === "view" && !("rows" in object)),
      true,
    );
    await f.api.database!.registerViews({
      chatIdentity: "chat-a",
      spaceId: schema.scopeId,
      schemaKey: schema.schemaKey,
      namespace: "ste_phone",
      views: schema.objects.map((object) => ({ name: object.name, select: object.select! })),
    });
    assert.equal(
      f.db.prepare("SELECT date(world_time) AS day FROM phone_world_state").get()!.day,
      "2026-10-30",
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS count FROM phone_chronicle_characters").get()!.count,
      4,
    );
    assert.equal(f.db.prepare("SELECT tags FROM src_custom_notes").get()!.tags, '["线索","校园"]');
    assert.match(
      String(f.db.prepare("SELECT profile_text FROM phone_items").get()!.profile_text),
      /owner：小蓝/,
    );
    f.db.exec("UPDATE characters SET name='蓝同学' WHERE \"$record_id\"='blue'");
    assert.match(
      String(f.db.prepare("SELECT profile_text FROM phone_items").get()!.profile_text),
      /owner：蓝同学/,
    );
    assert.equal(
      schema.objects
        .flatMap((object) => object.columns)
        .some((column) => ["_phone_payload_json", "_phone_record_json"].includes(column.name)),
      false,
    );
  } finally {
    f.dispose();
  }
});

test("unsupported mappings retain raw source visibility and explain missing fields without empty placeholder views", () => {
  const f = memoryDatabaseFixture();
  try {
    const schema = mapMemoryDatabase({
      ...f.description,
      fields: f.description.fields.filter((field) => field.key !== "details"),
    });
    assert.equal(
      schema.objects.some((object) => object.name === "phone_chronicles"),
      false,
    );
    assert.equal(
      schema.objects.some((object) => object.name === "src_chronicle"),
      true,
    );
    assert.match(
      schema.objects.find((object) => object.name === "phone_capabilities")!.select!,
      /chronicle.details/,
    );
  } finally {
    f.dispose();
  }
});

test("raw alias collisions fail at schema construction", () => {
  const f = memoryDatabaseFixture();
  try {
    assert.throws(
      () =>
        mapMemoryDatabase({
          ...f.description,
          tables: [
            ...f.description.tables,
            { ...f.description.tables[0]!, id: "collision", key: "src_characters" },
          ],
          columns: {
            ...f.description.columns,
            src_characters: [
              "$stable_id",
              "$record_id",
              "$display_text",
              "$created_at",
              "$updated_at",
            ],
          },
        }),
      /碰撞/,
    );
  } finally {
    f.dispose();
  }
});

test("raw references to disabled target tables remain queryable with explicit metadata", async () => {
  const snapshot = memorySnapshotFixture();
  const f = memoryDatabaseFixture({
    ...snapshot,
    tables: snapshot.tables.map((table) =>
      table.key === "characters" ? { ...table, enabled: false } : table,
    ),
  });
  try {
    const schema = mapMemoryDatabase(f.description);
    const owner = schema.objects
      .find((object) => object.name === "src_items")!
      .columns.find((column) => column.name === "owner")!;
    assert.match(owner.description, /目标表未公开/);
    assert.equal(owner.reference, undefined);
    assert.equal(
      schema.objects.some((object) => object.name === "phone_items"),
      false,
    );
    await f.api.database!.registerViews({
      chatIdentity: "chat-a",
      spaceId: schema.scopeId,
      schemaKey: schema.schemaKey,
      namespace: "ste_phone",
      views: schema.objects.map((object) => ({ name: object.name, select: object.select! })),
    });
    assert.equal(f.db.prepare("SELECT owner FROM src_items").get()!.owner, "blue");
    assert.throws(() => f.db.prepare("SELECT * FROM characters"), /no such table/);
  } finally {
    f.dispose();
  }
});
