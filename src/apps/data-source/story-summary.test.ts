import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readStorySummary } from "./story-summary.ts";
import type { DataAppPublic, SqlValue } from "./public.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE phone_plot_summaries(record_id TEXT,title TEXT,start_time TEXT,end_time TEXT,content TEXT,created_at TEXT);
    CREATE TABLE phone_summary_sources(record_id TEXT,title TEXT,start_time TEXT,end_time TEXT,content TEXT,created_at TEXT,summary_id TEXT);
    INSERT INTO phone_plot_summaries VALUES ('s1','开篇','2026-01-01','2026-01-02','早期总结','1'),('s2','后篇',NULL,NULL,'后期总结','2');
    INSERT INTO phone_summary_sources VALUES ('c1','已覆盖',NULL,NULL,'不应重复','1','s1'),('c2','未总结',NULL,NULL,'新纪要','2',NULL);`);
  const queries: string[] = [];
  const data = {
    describe: async () => ({
      objects: [{ name: "phone_plot_summaries" }, { name: "phone_summary_sources" }],
    }),
    query: async ({ sql, params }: { sql: string; params?: Record<string, SqlValue> }) => {
      queries.push(sql);
      const statement = db.prepare(sql);
      const result = params ? statement.all(params) : statement.all();
      return { rows: result.map((row) => Object.values(row)), truncated: false };
    },
  } as unknown as DataAppPublic;
  return { db, data, queries };
}
const scope = { chatIdentity: "chat", scopeId: "scope" };

test("summary includes every large summary, excludes covered chronicles and preserves source order", async () => {
  const { db, data } = fixture();
  try {
    const result = await readStorySummary(data, scope);
    assert.match(result, /早期总结/);
    assert.match(result, /后期总结/);
    assert.match(result, /新纪要/);
    assert.doesNotMatch(result, /不应重复/);
    assert.ok(result.indexOf("早期总结") < result.indexOf("后期总结"));
  } finally {
    db.close();
  }
});
test("summary reads beyond a full page and reports dangling ownership", async () => {
  const { db, data, queries } = fixture();
  try {
    const insert = db.prepare("INSERT INTO phone_summary_sources VALUES (?,?,NULL,NULL,?,?,NULL)");
    for (let index = 0; index < 205; index++) {
      insert.run(`extra-${index}`, `纪要${index}`, `内容${index}`, String(index));
    }
    assert.match(await readStorySummary(data, scope), /内容204/);
    assert.equal(
      queries.filter((sql) => sql.includes("FROM phone_summary_sources WHERE")).length,
      2,
    );
    db.exec("UPDATE phone_summary_sources SET summary_id='missing' WHERE record_id='c2'");
    await assert.rejects(readStorySummary(data, scope), /不存在/);
  } finally {
    db.close();
  }
});
test("summary empty data is normal; missing mapping is explicit", async () => {
  const { db, data } = fixture();
  try {
    db.exec("DELETE FROM phone_summary_sources; DELETE FROM phone_plot_summaries;");
    assert.equal(await readStorySummary(data, scope), "");
    data.describe = async () => ({ objects: [] }) as never;
    await assert.rejects(readStorySummary(data, scope), /结构不可用/);
  } finally {
    db.close();
  }
});
