import type {
  DatabaseEngine,
  DatabaseSnapshot,
  QueryResult,
  SqlValue,
} from "../../features/database/index.ts";
import type { DatabaseRequest, DatabaseResponse } from "./worker-protocol.ts";

export class DatabaseWorkerClient implements DatabaseEngine {
  #worker: Worker | undefined;
  #sequence = 0;
  #failure: Error | undefined;
  readonly #pending = new Map<
    number,
    {
      resolve: (result: QueryResult | undefined) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  #startWorker(): Worker {
    const worker = new Worker(new URL("./database-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<DatabaseResponse>) => {
      const response = event.data;
      const pending = this.#pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error));
    };
    worker.onerror = (event) => this.#fail(new Error(`数据库 Worker 失败：${event.message}`));
    worker.onmessageerror = () => this.#fail(new Error("数据库 Worker 响应无法读取"));
    this.#worker = worker;
    return worker;
  }
  async replace(binding: string, snapshot: DatabaseSnapshot): Promise<void> {
    await this.#request({ type: "replace", binding, snapshot });
  }
  async query(
    binding: string,
    sql: string,
    params?: Readonly<Record<string, SqlValue>>,
  ): Promise<QueryResult> {
    return (await this.#request({ type: "query", binding, sql, params }))!;
  }
  dispose(): void {
    this.#fail(new Error("数据库 Worker 已关闭"));
  }
  #request(
    request:
      | Omit<Extract<DatabaseRequest, { type: "replace" }>, "id">
      | Omit<Extract<DatabaseRequest, { type: "query" }>, "id">,
  ): Promise<QueryResult | undefined> {
    if (this.#failure) return Promise.reject(this.#failure);
    const worker = this.#worker ?? this.#startWorker();
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.#fail(new Error("数据库 Worker 未响应，请刷新页面重试")),
        30_000,
      );
      this.#pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ ...request, id });
      } catch (error) {
        this.#fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  #fail(error: Error): void {
    this.#failure = error;
    this.#worker?.terminate();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
