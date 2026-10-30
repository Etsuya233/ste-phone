import assert from "node:assert/strict";
import { test } from "node:test";
import { mapMemoryBackground } from "./map-background.ts";
import type { MemoryField, MemorySnapshot } from "./public-read-contract.ts";

function fixture(): MemorySnapshot {
  const definitions = {
    characters: {
      name: "short_text",
      personality: "long_text",
      background: "long_text",
      current_status: "long_text",
    },
    chronicle: { summary: "short_text", details: "long_text" },
    items: { name: "short_text", key_attributes: "long_text", owner: "single_reference" },
  } as const;
  return {
    space: { id: "space", name: "空间" },
    tables: Object.keys(definitions).map((key) => ({
      id: key,
      key,
      name: key,
      enabled: true,
      displayStrategy: {
        type: "field",
        fieldId: `${key}.${key === "chronicle" ? "summary" : "name"}`,
      },
    })),
    fields: Object.entries(definitions).flatMap(([tableId, fields]) =>
      Object.entries(fields).map(
        ([key, type], position) =>
          ({
            id: `${tableId}.${key}`,
            tableId,
            key,
            name: key,
            type,
            enabled: true,
            position,
            referenceTableId: key === "owner" ? "characters" : null,
          }) satisfies MemoryField,
      ),
    ),
    records: [
      {
        id: "red",
        tableId: "characters",
        payload: { "characters.name": "红", "characters.personality": "直率" },
        displayText: "小红（旧名称）",
        createdAt: "2026-01-01",
      },
      {
        id: "another-red",
        tableId: "characters",
        payload: { "characters.name": "红" },
        displayText: "红",
        createdAt: "2026-01-01",
      },
      {
        id: "notebook",
        tableId: "items",
        payload: { "items.name": "笔记本", "items.owner": "red" },
        displayText: "笔记本",
        createdAt: "2026-01-01",
      },
      ...Array.from({ length: 125 }, (_, index) => ({
        id: `event-${String(index).padStart(3, "0")}`,
        tableId: "chronicle",
        payload: { "chronicle.summary": `纪要${index}`, "chronicle.details": "事件正文" },
        displayText: "纪要",
        createdAt: "2026-01-01",
      })).reverse(),
    ],
  };
}

test("mapping keeps duplicate names and stable IDs, renders current reference names, and includes every record in stable order", () => {
  const result = mapMemoryBackground(fixture());
  assert.equal(result.characters.length, 2);
  assert.deepEqual(
    new Set(result.characters.map((item) => item.id)),
    new Set(["red", "another-red"]),
  );
  assert.match(result.items[0]!.description, /owner：红/);
  assert.doesNotMatch(result.items[0]!.description, /旧名称/);
  assert.equal(result.chronicles.length, 125);
  assert.equal(result.chronicles[0]!.id, "event-000");
  assert.equal(result.chronicles.at(-1)!.id, "event-124");
});

test("empty tables are valid; missing or incompatible schema is an error", () => {
  const fixtureData = fixture();
  assert.equal(mapMemoryBackground({ ...fixtureData, records: [] }).characters.length, 0);
  assert.throws(
    () =>
      mapMemoryBackground({
        ...fixtureData,
        tables: fixtureData.tables.filter((table) => table.key !== "chronicle"),
      }),
    /缺少启用/,
  );
  assert.throws(
    () =>
      mapMemoryBackground({
        ...fixtureData,
        fields: fixtureData.fields.map((field) =>
          field.key === "personality" ? { ...field, type: "short_text" } : field,
        ),
      }),
    /类型不符/,
  );
});
