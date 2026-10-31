import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { memorySnapshotFixture } from "../../tests/fixtures/memory-snapshot.ts";
import type { DatabaseObject, SqlValue } from "../../src/apps/data-source/public.ts";
import type {
  MemoryDatabaseDescription,
  MemoryReadApi,
} from "../../src/infrastructure/ste-memory/public-read-contract.ts";
import { SqliteDatabase } from "./preview-sqlite.ts";

/** 独立预览的 Memory capability；SQLite 和样例 records 仅进入预览 bundle。 */
export function createPreviewMemory(mode: string | null): MemoryReadApi {
  const fixture = memorySnapshotFixture(mode === "empty");
  const tables = fixture.tables;
  const fields = fixture.fields.filter(
    (field) => field.enabled && !(mode === "unsupported" && field.key === "details"),
  );
  const description: MemoryDatabaseDescription = {
    databaseKey: "preview-db",
    space: fixture.space,
    tables,
    fields,
    schemaKey: `preview-v1:${mode}`,
    columns: Object.fromEntries(
      tables.map((table) => [
        table.key,
        [
          "$record_id",
          "$display_text",
          "$created_at",
          "$updated_at",
          ...fields.filter((field) => field.tableId === table.id).map((field) => field.key),
        ],
      ]),
    ),
  };
  const context = {
    revision: 1,
    chatIdentity: "preview:story",
    chatName: "放学之后 · 独立预览",
    spaceId: fixture.space.id,
    spaceName: fixture.space.name,
    available: mode !== "unavailable",
    message: mode === "unavailable" ? "预览：当前未连接资料来源" : null,
  };
  const engine = sqlite3InitModule().then((sqlite) => new SqliteDatabase(sqlite));
  const source = tables.map((table): DatabaseObject & { rows: SqlValue[][] } => {
    const tableFields = fields.filter((field) => field.tableId === table.id);
    return {
      name: table.key,
      kind: "table",
      description: table.name,
      columns: description.columns[table.key]!.map((name) => ({
        name,
        type: "TEXT",
        description: name,
      })),
      rows: fixture.records
        .filter((record) => record.tableId === table.id)
        .map((record) => [
          record.id,
          record.displayText,
          record.createdAt,
          record.createdAt,
          ...tableFields.map((field) => {
            const value = record.payload[field.id];
            if (value === undefined || value === null) return null;
            if (Array.isArray(value)) return JSON.stringify(value);
            if (typeof value === "boolean") return Number(value);
            return value as SqlValue;
          }),
        ]),
    };
  });
  return {
    version: 1,
    getContext: () => context,
    subscribe: () => () => {},
    read: async () => {
      throw new Error("预览禁止读取完整快照");
    },
    database: {
      version: 1,
      async describe() {
        if (mode === "error") throw new Error("预览：Memory 数据库读取失败");
        return description;
      },
      async registerViews({ views }) {
        const db = await engine;
        db.replace("preview", {
          objects: [
            ...source,
            ...views.map((view) => ({
              name: view.name,
              kind: "view" as const,
              description: "",
              select: view.select,
              columns: view.columns!.map((name) => ({
                name,
                type: "TEXT" as const,
                description: name,
              })),
            })),
          ],
        });
      },
      async query({ sql, params, maxRows, budgetMs }) {
        return (await engine).query("preview", sql, { params, maxRows, budgetMs });
      },
    },
  };
}
