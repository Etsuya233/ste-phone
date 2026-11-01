import type { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { identifierKey, quoteIdentifier } from "../../src/apps/data-source/database.ts";
import type { DatabaseObject, QueryResult, SqlValue } from "../../src/apps/data-source/public.ts";

interface PreviewDatabase {
  readonly objects: readonly (DatabaseObject & {
    readonly rows?: readonly (readonly SqlValue[])[];
  })[];
}

const dangerousFunctions = new Set([
  "load_extension",
  "readfile",
  "writefile",
  "edit",
  "fts3_tokenizer",
]);

/** 独立内存库；建库成功后才替换旧库。所有对外 SQL 都经过原生授权和执行预算。 */
export class SqliteDatabase {
  readonly #sqlite: Sqlite3Static;
  #db: Database | undefined;
  #binding: string | undefined;
  #allowed = new Map<string, ReadonlySet<string>>();
  constructor(sqlite: Sqlite3Static) {
    this.#sqlite = sqlite;
  }

  replace(binding: string, snapshot: PreviewDatabase): void {
    const db = new this.#sqlite.oo1.DB(":memory:", "c");
    try {
      const names = new Set<string>();
      db.exec("BEGIN");
      for (const object of snapshot.objects) {
        const key = identifierKey(object.name);
        if (names.has(key)) {
          throw new Error(`SQLite 对象名碰撞：${object.name}`);
        }
        names.add(key);
        const columns = new Set<string>();
        for (const column of object.columns) {
          const key = identifierKey(column.name);
          if (columns.has(key)) {
            throw new Error(`SQLite 列名碰撞：${object.name}.${column.name}`);
          }
          columns.add(key);
        }
        if (object.kind === "view") {
          if (!object.select) {
            throw new Error(`视图缺少 SELECT：${object.name}`);
          }
          db.exec(`CREATE VIEW ${quoteIdentifier(object.name)} AS ${object.select}`);
        } else {
          db.exec(
            `CREATE TABLE ${quoteIdentifier(object.name)} (${object.columns.map((column) => `${quoteIdentifier(column.name)} ${column.type}`).join(",")}) STRICT`,
          );
          const insert = db.prepare(
            `INSERT INTO ${quoteIdentifier(object.name)} VALUES(${object.columns.map(() => "?").join(",")})`,
          );
          try {
            for (const row of object.rows!) {
              insert.bind([...row]);
              insert.step();
              insert.reset();
            }
          } finally {
            insert.finalize();
          }
        }
      }
      // 提前编译全部视图，错误不能延迟到成功发布后才暴露。
      for (const object of snapshot.objects) {
        db.exec(`SELECT * FROM ${quoteIdentifier(object.name)} LIMIT 0`);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.close();
      throw error;
    }
    const old = this.#db;
    this.#db = db;
    this.#binding = binding;
    this.#allowed = new Map(
      snapshot.objects.map((object) => [
        identifierKey(object.name),
        new Set(object.columns.map((column) => identifierKey(column.name))),
      ]),
    );
    old?.close();
  }

  query(
    binding: string,
    sql: string,
    options: {
      maxRows?: number;
      budgetMs?: number;
      params?: Readonly<Record<string, SqlValue>>;
    } = {},
  ): QueryResult {
    const db = this.#db;
    if (!db || binding !== this.#binding) {
      throw new Error("当前聊天的数据库尚未就绪，请刷新");
    }
    const { capi, wasm } = this.#sqlite;
    const started = performance.now();
    const maxRows = options.maxRows ?? 200;
    const budgetMs = options.budgetMs ?? 750;
    const deadline = started + budgetMs;
    const actions = new Set<number>([
      capi.SQLITE_SELECT,
      capi.SQLITE_READ,
      capi.SQLITE_FUNCTION,
      capi.SQLITE_RECURSIVE,
    ]);
    // SQLite 的长度上限同时覆盖字符串/Blob，避免单次函数先分配巨大内存。
    const limits = [
      [capi.SQLITE_LIMIT_LENGTH, 1_000_000],
      [capi.SQLITE_LIMIT_SQL_LENGTH, 100_000],
      [capi.SQLITE_LIMIT_VARIABLE_NUMBER, 100],
      [capi.SQLITE_LIMIT_EXPR_DEPTH, 100],
      [capi.SQLITE_LIMIT_COMPOUND_SELECT, 100],
    ] as const;
    const previousLimits = limits.map(([id, value]) => capi.sqlite3_limit(db.pointer!, id, value));
    capi.sqlite3_set_authorizer(
      db.pointer!,
      (_arg, action, tableName, columnName, databaseName) => {
        if (!actions.has(action)) {
          return capi.SQLITE_DENY;
        }
        if (
          action === capi.SQLITE_FUNCTION &&
          dangerousFunctions.has(String(columnName).toLowerCase())
        ) {
          return capi.SQLITE_DENY;
        }
        if (action === capi.SQLITE_READ) {
          const table = identifierKey(String(tableName));
          if (["json_each", "json_tree"].includes(table)) {
            return capi.SQLITE_OK;
          }
          const columns = this.#allowed.get(table);
          if (
            (databaseName && databaseName !== "main") ||
            !columns ||
            (columnName !== "" && !columns.has(identifierKey(String(columnName))))
          ) {
            return capi.SQLITE_DENY;
          }
        }
        return capi.SQLITE_OK;
      },
      0,
    );
    capi.sqlite3_progress_handler(
      db.pointer!,
      1000,
      () => (performance.now() >= deadline ? 1 : 0),
      0,
    );
    let source = 0,
      statementPointer = 0,
      tailPointer = 0,
      statement = 0;
    try {
      if (sql.includes("\0")) {
        throw new Error("SQL 不能包含 NUL");
      }
      source = wasm.allocCString(sql, false);
      statementPointer = wasm.allocPtr(1);
      tailPointer = wasm.allocPtr(1);
      let cursor = source;
      while (wasm.heap8u()[cursor] !== 0) {
        const code = capi.sqlite3_prepare_v3(
          db.pointer!,
          cursor,
          -1,
          0,
          statementPointer,
          tailPointer,
        );
        const next = wasm.peekPtr(statementPointer);
        try {
          db.checkRc(code);
        } catch (error) {
          if (next) {
            capi.sqlite3_finalize(next);
          }
          throw error;
        }
        cursor = wasm.peekPtr(tailPointer);
        if (!next) {
          continue;
        }
        if (statement) {
          capi.sqlite3_finalize(next);
          throw new Error("SQL 只允许一条只读查询语句");
        }
        statement = next;
      }
      if (
        !statement ||
        !capi.sqlite3_stmt_readonly(statement) ||
        capi.sqlite3_column_count(statement) === 0
      ) {
        throw new Error("SQL 需要一条返回结果的只读查询语句");
      }
      const unused = new Set(Object.keys(options.params ?? {}));
      for (let index = 1; index <= capi.sqlite3_bind_parameter_count(statement); index++) {
        const name = capi.sqlite3_bind_parameter_name(statement, index);
        if (!name || !name.startsWith(":")) {
          throw new Error("SQL 绑定参数必须使用 :name");
        }
        const key = name.slice(1);
        const value = options.params?.[key];
        if (value === undefined) {
          throw new Error(`SQL 缺少绑定参数：${name}`);
        }
        unused.delete(key);
        if (typeof value === "string") {
          const text = wasm.allocCString(value, false);
          try {
            db.checkRc(
              capi.sqlite3_bind_text(
                statement,
                index,
                text,
                new TextEncoder().encode(value).byteLength,
                capi.SQLITE_TRANSIENT,
              ),
            );
          } finally {
            wasm.dealloc(text);
          }
        } else {
          db.checkRc(
            value === null
              ? capi.sqlite3_bind_null(statement, index)
              : capi.sqlite3_bind_double(statement, index, value),
          );
        }
      }
      if (unused.size) {
        throw new Error(`SQL 包含未使用的绑定参数：${[...unused].join("、")}`);
      }
      const columns = Array.from({ length: capi.sqlite3_column_count(statement) }, (_, index) =>
        capi.sqlite3_column_name(statement, index)!,
      );
      const rows: SqlValue[][] = [];
      let truncated = false,
        bytes = 0,
        step: number;
      while ((step = capi.sqlite3_step(statement)) === capi.SQLITE_ROW) {
        if (performance.now() >= deadline) {
          throw new Error(`SQL 执行超时（${budgetMs} ms）`);
        }
        if (rows.length === maxRows) {
          truncated = true;
          break;
        }
        const row = columns.map((_, index): SqlValue => {
          const value = capi.sqlite3_column_js(statement, index);
          if (value instanceof Uint8Array) {
            throw new Error("结果包含 Blob，请使用 hex() 或转换为文本");
          }
          return typeof value === "bigint" ? value.toString() : (value as SqlValue);
        });
        bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
        if (bytes > 2_000_000) {
          throw new Error("查询结果超过 2 MB，请缩小选择的列或行数");
        }
        rows.push(row);
      }
      if (!truncated && step !== capi.SQLITE_DONE) {
        if (step === capi.SQLITE_INTERRUPT) {
          throw new Error(`SQL 执行超时（${budgetMs} ms）`);
        }
        db.checkRc(step);
      }
      return { columns, rows, truncated, maxRows, elapsedMs: performance.now() - started };
    } catch (error) {
      if (performance.now() >= deadline) {
        throw new Error(`SQL 执行超时（${budgetMs} ms）`, { cause: error });
      }
      throw error;
    } finally {
      if (statement) {
        capi.sqlite3_finalize(statement);
      }
      if (source) {
        wasm.dealloc(source);
      }
      if (statementPointer) {
        wasm.dealloc(statementPointer);
      }
      if (tailPointer) {
        wasm.dealloc(tailPointer);
      }
      capi.sqlite3_set_authorizer(db.pointer!, () => capi.SQLITE_OK, 0);
      capi.sqlite3_progress_handler(db.pointer!, 0, 0, 0);
      limits.forEach(([id], index) => capi.sqlite3_limit(db.pointer!, id, previousLimits[index]!));
    }
  }

  dispose(): void {
    this.#db?.close();
    this.#db = undefined;
    this.#binding = undefined;
    this.#allowed.clear();
  }
}
