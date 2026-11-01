import { DatabaseSync } from "node:sqlite";
import type {
  MemoryDatabaseDescription,
  MemoryReadApi,
  MemorySnapshot,
} from "../../src/infrastructure/ste-memory/public-read-contract.ts";
import type { SqlValue } from "../../src/apps/data-source/database.ts";
import { quoteIdentifier as q } from "../../src/apps/data-source/database.ts";
import { memorySnapshotFixture } from "./memory-snapshot.ts";

/** 真实 SQL 的公开 capability 测试替身；Phone 只获得 describe 与 query 结果。 */
export function memoryDatabaseFixture(snapshot: MemorySnapshot = memorySnapshotFixture()) {
  const db = new DatabaseSync(":memory:");
  const listeners = new Set<() => void>();
  const tables = snapshot.tables.filter((table) => table.enabled);
  const fields = snapshot.fields.filter(
    (field) => field.enabled && tables.some((table) => table.id === field.tableId),
  );
  let description: MemoryDatabaseDescription = {
    databaseKey: "db-v1",
    space: snapshot.space,
    tables,
    fields,
    schemaKey: "schema-v1",
    columns: Object.fromEntries(
      tables.map((table) => [
        table.key,
        [
          "$record_id",
          "$stable_id",
          "$display_text",
          "$created_at",
          "$updated_at",
          ...fields.filter((field) => field.tableId === table.id).map((field) => field.key),
        ],
      ]),
    ),
  };
  let context = {
    revision: 1,
    chatIdentity: "chat-a",
    chatName: "A",
    spaceId: snapshot.space.id,
    spaceName: snapshot.space.name,
    available: true,
    message: null as string | null,
  };
  for (const table of tables) {
    const tableFields = fields.filter((field) => field.tableId === table.id);
    const system = ["$record_id", "$stable_id", "$display_text", "$created_at", "$updated_at"];
    db.exec(
      `CREATE TABLE ${q(table.key)} (${[...system.map((name) => `${q(name)} TEXT`), ...tableFields.map((field) => `${q(field.key)} ${["integer", "boolean"].includes(field.type) ? "INTEGER" : field.type === "decimal" ? "REAL" : "TEXT"}`)].join(",")})`,
    );
    const insert = db.prepare(
      `INSERT INTO ${q(table.key)} VALUES(${description.columns[table.key]!.map(() => "?").join(",")})`,
    );
    for (const record of snapshot.records.filter((record) => record.tableId === table.id)) {
      insert.run(
        record.id,
        record.stableId,
        record.displayText,
        record.createdAt,
        record.createdAt,
        ...tableFields.map((field) => {
          const value = record.payload[field.id];
          if (value === undefined || value === null) {
            return null;
          }
          if (Array.isArray(value)) {
            return JSON.stringify(value);
          }
          if (typeof value === "boolean") {
            return Number(value);
          }
          return value as SqlValue;
        }),
      );
    }
  }
  const stats = { describes: 0, registrations: 0, reads: 0, queries: [] as string[] };
  let viewNames: string[] = [];
  let queryGate: (() => Promise<void>) | undefined;
  const api: MemoryReadApi = {
    version: 1,
    identity: { version: 1 },
    getContext: () => context,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async read() {
      stats.reads++;
      throw new Error("Phone 不得读取完整 records");
    },
    database: {
      version: 1,
      async describe() {
        stats.describes++;
        return description;
      },
      async registerViews({ views }) {
        stats.registrations++;
        for (const name of viewNames) {
          db.exec(`DROP VIEW ${q(name)}`);
        }
        viewNames = views.map((view) => view.name);
        for (const view of views) {
          db.exec(`CREATE VIEW ${q(view.name)} AS ${view.select}`);
        }
        for (const view of views) {
          db.prepare(`SELECT * FROM ${q(view.name)} LIMIT 0`).all();
        }
      },
      async query({ sql, params, maxRows = 200 }) {
        stats.queries.push(sql);
        await queryGate?.();
        const statement = db.prepare(sql);
        const columns = statement.columns().map((column) => column.name);
        const values = params ? statement.all({ ...params }) : statement.all();
        return {
          columns,
          rows: values.slice(0, maxRows).map((row) => columns.map((name) => row[name] as SqlValue)),
          elapsedMs: 0,
          truncated: values.length > maxRows,
          maxRows,
        };
      },
    },
  };
  return {
    api,
    db,
    stats,
    get description() {
      return description;
    },
    setDescription(next: MemoryDatabaseDescription) {
      description = next;
    },
    deferQuery(gate: () => Promise<void>) {
      queryGate = gate;
    },
    change(next: Partial<typeof context> = {}) {
      context = { ...context, ...next, revision: context.revision + 1 };
      for (const listener of listeners) {
        listener();
      }
    },
    install() {
      globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
      globalThis.STE_MEMORY_API = api;
    },
    dispose() {
      db.close();
    },
  };
}
