import assert from "node:assert/strict";
import { test } from "node:test";
import { memorySnapshotFixture } from "../../../tests/fixtures/memory-snapshot.ts";
import { mapMemoryBackground } from "./map-background.ts";
import { mapMemoryDatabase } from "./map-database.ts";

test("source identifier collisions are explicit, including ASCII case and reserved metadata columns", () => {
  const snapshot = memorySnapshotFixture();
  const background = mapMemoryBackground(snapshot);
  assert.throws(
    () =>
      mapMemoryDatabase(
        {
          ...snapshot,
          tables: [
            ...snapshot.tables,
            { ...snapshot.tables[0]!, id: "duplicate", key: "CHARACTERS" },
          ],
        },
        background,
      ),
    /表名碰撞/,
  );
  assert.throws(
    () =>
      mapMemoryDatabase(
        {
          ...snapshot,
          fields: [...snapshot.fields, { ...snapshot.fields[0]!, id: "duplicate", key: "NAME" }],
        },
        background,
      ),
    /列名碰撞/,
  );
  assert.throws(
    () =>
      mapMemoryDatabase(
        {
          ...snapshot,
          fields: [
            ...snapshot.fields,
            { ...snapshot.fields[0]!, id: "reserved", key: "_PHONE_record_id" },
          ],
        },
        background,
      ),
    /保留前缀/,
  );
  const quoted = mapMemoryDatabase(
    {
      ...snapshot,
      tables: snapshot.tables.map((table) =>
        table.key === "custom_notes" ? { ...table, key: 'custom "notes"' } : table,
      ),
    },
    background,
  );
  assert.ok(quoted.objects.some((object) => object.name === 'src_custom "notes"'));
});

test("optional standard fields require compatible types and reference targets, while complete source columns survive", () => {
  const snapshot = memorySnapshotFixture();
  const modified = {
    ...snapshot,
    fields: snapshot.fields.map((field) =>
      field.key === "owner"
        ? { ...field, referenceTableId: "table-items" }
        : field.key === "related_characters" || field.key === "start_time"
          ? { ...field, type: "short_text" as const }
          : field,
    ),
    records: snapshot.records.map((record) =>
      record.id === "notebook"
        ? { ...record, payload: { ...record.payload, "items.owner": "notebook" } }
        : record,
    ),
  };
  const model = mapMemoryDatabase(modified, {
    sourceId: "ste-memory",
    scopeId: snapshot.space.id,
    characters: [],
    chronicles: [],
    items: [],
    backgroundError: "具体展示映射错误",
  });
  for (const [view, column] of [
    ["phone_items", "owner_id"],
    ["phone_chronicles", "related_character_ids"],
    ["phone_chronicles", "start_time"],
  ]) {
    const object = model.objects.find((object) => object.name === view)!;
    assert.match(object.columns.find((item) => item.name === column)!.description, /返回 NULL/);
    assert.match(object.select!, new RegExp(`CAST\\(NULL AS TEXT\\) AS "${column}"`));
  }
  assert.equal(
    model.objects
      .find((object) => object.name === "src_chronicle")!
      .columns.find((column) => column.name === "start_time")!.sourceFieldId,
    "chronicle.start_time",
  );
  const relation = model.objects.find((object) => object.name === "phone_chronicle_characters")!;
  assert.match(relation.description, /unsupported/);
});
