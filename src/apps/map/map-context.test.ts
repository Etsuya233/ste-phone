import assert from "node:assert/strict";
import test from "node:test";
import { createMapStoryReader } from "./map-tool-story.ts";
import type { DataAppPublic, DatabaseSchema } from "../data-source/public.ts";

test("default story reading exposes every src table and its stable record identity", async () => {
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
  const reader = createMapStoryReader(data, new AbortController().signal);
  assert.deepEqual(
    (await reader.directory()).tables.map((table) => table.name),
    ["src_setting_archive"],
  );
  assert.deepEqual(queried, []);
  await assert.rejects(reader.records("src_private", 1, 0), /不存在/);
  assert.deepEqual(queried, []);
  const page = await reader.records("src_setting_archive", 1, 0);
  assert.match(queried[0]!, /"src_setting_archive"/);
  assert.deepEqual(page.rows, [{ _phone_stable_record_id: "stable-library", name: "图书馆" }]);
  assert.deepEqual([...reader.memoryIds], ["stable-library"]);
  assert.equal((await reader.summary()).summary, "剧情回顾");
});
