import assert from "node:assert/strict";
import test from "node:test";
import { readMapStory } from "./map-context.ts";
import type { DataAppPublic, DatabaseSchema } from "../data-source/public.ts";

test("explicit source selection reads a nonstandard setting table with its stable record identity", async () => {
  const queried: string[] = [];
  const schema: DatabaseSchema = {
    sourceId: "memory",
    scopeId: "instance",
    stableScopeId: "stable",
    name: "资料",
    schemaVersion: 1,
    schemaKey: "schema",
    databaseKey: "db",
    objects: [{ name: "src_setting_archive", kind: "view", description: "设定集", columns: [] }],
  };
  const data = {
    getSnapshot: () => ({
      context: { available: true, chatIdentity: "chat", scopeId: "instance" },
    }),
    describe: async () => schema,
    readSummary: async () => "剧情回顾",
    query: async ({ sql }: { sql: string }) => {
      queried.push(sql);
      return {
        columns: ["_phone_stable_record_id", "name"],
        rows: [["stable-library", "图书馆"]],
        truncated: false,
      };
    },
  } as unknown as DataAppPublic;
  const story = (await readMapStory(data, new AbortController().signal, [
    "src_setting_archive",
  ])) as { records: { table: string; rows: unknown[] }[]; summary: string };
  assert.match(queried[0]!, /"src_setting_archive"/);
  assert.deepEqual(story.records[0]!.rows, [
    { _phone_stable_record_id: "stable-library", name: "图书馆" },
  ]);
  assert.equal(story.records[0]!.table, "src_setting_archive");
  assert.equal(story.summary, "剧情回顾");
  await assert.rejects(readMapStory(data, new AbortController().signal, ["missing"]), /不存在/);
});
