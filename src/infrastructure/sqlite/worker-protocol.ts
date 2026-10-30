import type { DatabaseSnapshot, QueryResult, SqlValue } from "../../features/database/index.ts";
export type DatabaseRequest = { id: number; binding: string } & (
  | { type: "replace"; snapshot: DatabaseSnapshot }
  | { type: "query"; sql: string; params?: Readonly<Record<string, SqlValue>> }
);
export type DatabaseResponse = { id: number } & (
  { ok: true; result?: QueryResult } | { ok: false; error: string }
);
