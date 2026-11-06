import type { LogRecord, LogRetention, LogStorage } from "../../apps/logs/ports/log-storage.ts";
import type { PhoneLogSummary } from "../../apps/logs/public.ts";
import { readLegacyLogs } from "./legacy-logs.ts";

interface StoredSummary {
  summary: PhoneLogSummary;
  group: string;
  bytes: number;
}

interface Usage {
  count: number;
  bytes: number;
}

const STORES = ["summaries", "details", "metadata"];
const USAGE_KEY = "usage";
const MIGRATED_KEY = "legacy-migrated";

export function createIndexedDbLogStorage(
  legacyKey: string,
  {
    factory = () => indexedDB,
    legacyStorage = () => localStorage,
  }: {
    factory?: () => IDBFactory;
    legacyStorage?: () => Pick<Storage, "getItem" | "removeItem">;
  } = {},
): LogStorage {
  let connection: IDBDatabase | undefined;

  async function database() {
    if (!connection) {
      connection = await openDatabase(factory(), legacyKey);
      const opened = connection;
      opened.onversionchange = () => {
        opened.close();
        if (connection === opened) {
          connection = undefined;
        }
      };
      opened.onclose = () => {
        if (connection === opened) {
          connection = undefined;
        }
      };
    }
    return connection;
  }

  return {
    async load(retention) {
      const db = await database();
      const legacy = legacyStorage();
      const migrated = await transaction(db, STORES, "readwrite", async (tx) => {
        const metadata = tx.objectStore("metadata");
        const usage = await readUsage(tx);
        let legacyIds: Set<string> | undefined;
        let removed = 0;
        if (!(await result(metadata.get(MIGRATED_KEY)))) {
          const raw = legacy.getItem(legacyKey);
          if (raw !== null) {
            const records = readLegacyLogs(raw);
            legacyIds = new Set(records.map(({ summary }) => summary.id));
            for (const record of records) {
              addRecord(tx, usage, record);
            }
          }
          metadata.put(true, MIGRATED_KEY);
        }
        const evicted = await evict(tx, usage, retention);
        if (legacyIds) {
          removed = evicted.filter((id) => legacyIds.has(id)).length;
        }
        metadata.put(usage, USAGE_KEY);
        const summaries: StoredSummary[] = await result(tx.objectStore("summaries").getAll());
        return { entries: summaries.map(({ summary }) => summary), removed };
      });
      // 标记与日志一起提交；提交后若页面退出，下一次打开只清旧键。
      const cleanup = removeLegacyLogs(legacy, legacyKey);
      const trimmed =
        migrated.removed > 0
          ? `旧版日志迁移时因容量限制清理了 ${migrated.removed} 条记录。`
          : undefined;
      return {
        entries: migrated.entries,
        warning: [trimmed, cleanup].filter(Boolean).join(" ") || undefined,
      };
    },
    async append(record, retention) {
      const db = await database();
      try {
        return await appendRecord(db, record, retention, false);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "QuotaExceededError")) {
          throw error;
        }
        return appendRecord(db, record, retention, true);
      }
    },
    async getDetails(id) {
      return transaction(await database(), "details", "readonly", (tx) =>
        result<string | undefined>(tx.objectStore("details").get(id)),
      );
    },
    async clear() {
      const db = await database();
      const legacy = legacyStorage();
      await transaction(db, STORES, "readwrite", async (tx) => {
        tx.objectStore("summaries").clear();
        tx.objectStore("details").clear();
        tx.objectStore("metadata").delete(USAGE_KEY);
        tx.objectStore("metadata").put(true, MIGRATED_KEY);
      });
      return removeLegacyLogs(legacy, legacyKey);
    },
  };
}

function removeLegacyLogs(legacy: Pick<Storage, "getItem" | "removeItem">, key: string) {
  try {
    if (legacy.getItem(key) !== null) {
      legacy.removeItem(key);
    }
  } catch (error) {
    // 事务已提交，旧键不会再参与读取。清理异常单独报告。
    return `旧版 LocalStorage 副本仍在：${String(error)}`;
  }
}

function openDatabase(factory: IDBFactory, legacyKey: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(`${legacyKey}-indexeddb`, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const summaries = db.createObjectStore("summaries", { autoIncrement: true });
      summaries.createIndex("group", "group");
      db.createObjectStore("details");
      db.createObjectStore("metadata");
    };
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("日志数据库正在被其他页面使用。"));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
      } else {
        resolve(request.result);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(stores, mode);
  const completion = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("日志事务中止。", "AbortError"));
  });
  const operation = work(tx).catch((error: unknown) => {
    // 解析、配额或请求失败时，两张表和迁移标记一并回滚。
    try {
      tx.abort();
    } catch (abortError) {
      if (!(abortError instanceof DOMException && abortError.name === "InvalidStateError")) {
        throw abortError;
      }
    }
    throw error;
  });
  const [value] = await Promise.all([operation, completion]);
  return value;
}

async function readUsage(tx: IDBTransaction): Promise<Usage> {
  return (await result(tx.objectStore("metadata").get(USAGE_KEY))) ?? { count: 0, bytes: 0 };
}

function addRecord(tx: IDBTransaction, usage: Usage, record: LogRecord) {
  const { summary, content, bytes } = record;
  tx.objectStore("summaries").add({
    summary,
    bytes,
    group: summary.groupId ?? summary.id,
  } satisfies StoredSummary);
  tx.objectStore("details").add(content, summary.id);
  usage.count++;
  usage.bytes += bytes;
}

async function appendRecord(
  db: IDBDatabase,
  record: LogRecord,
  retention: LogRetention,
  freeQuota: boolean,
) {
  return transaction(db, STORES, "readwrite", async (tx) => {
    const usage = await readUsage(tx);
    // 配额重试只多腾出最旧的一组，仍失败则原样回滚并把错误交给日志应用。
    const extra = freeQuota ? await deleteOldestGroup(tx, usage, record.summary.groupId) : [];
    addRecord(tx, usage, record);
    const evicted = await evict(tx, usage, retention);
    tx.objectStore("metadata").put(usage, USAGE_KEY);
    return [...extra, ...evicted];
  });
}

async function evict(tx: IDBTransaction, usage: Usage, retention: LogRetention) {
  const evicted: string[] = [];
  while (usage.count > retention.count || usage.bytes > retention.bytes) {
    evicted.push(...(await deleteOldestGroup(tx, usage)));
  }
  return evicted;
}

async function deleteOldestGroup(tx: IDBTransaction, usage: Usage, preserveGroup?: string) {
  const summaries = tx.objectStore("summaries");
  const oldest = await result(summaries.openCursor());
  if (!oldest || (oldest.value as StoredSummary).group === preserveGroup) {
    return [];
  }
  const group = (oldest.value as StoredSummary).group;
  const index = summaries.index("group");
  const [records, keys] = await Promise.all([
    result<StoredSummary[]>(index.getAll(group)),
    result(index.getAllKeys(group)),
  ]);
  const details = tx.objectStore("details");
  for (const key of keys) {
    summaries.delete(key);
  }
  for (const record of records) {
    details.delete(record.summary.id);
    usage.count--;
    usage.bytes -= record.bytes;
  }
  return records.map(({ summary }) => summary.id);
}
