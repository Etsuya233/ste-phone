import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { SqliteDatabase } from "./engine.ts";
import type { DatabaseRequest, DatabaseResponse } from "./worker-protocol.ts";

// 模块初始化与所有后续请求共用同一串行队列，建库不会与查询交错。
let queue = sqlite3InitModule().then((sqlite) => new SqliteDatabase(sqlite));
globalThis.onmessage = (event: MessageEvent<DatabaseRequest>) => {
  const request = event.data;
  const next = queue.then((engine) => {
    try {
      if (request.type === "replace") engine.replace(request.binding, request.snapshot);
      const result =
        request.type === "query"
          ? engine.query(request.binding, request.sql, { params: request.params })
          : undefined;
      globalThis.postMessage({ id: request.id, ok: true, result } satisfies DatabaseResponse);
    } catch (error) {
      globalThis.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies DatabaseResponse);
    }
    return engine;
  });
  // WASM 启动失败也必须结算每个排队请求，不能留下永不完成的 pending。
  void next.catch((error: unknown) =>
    globalThis.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies DatabaseResponse),
  );
  queue = next;
};
