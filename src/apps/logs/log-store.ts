import { formatLogDetails } from "./log-format.ts";
import { logGroupId, logRecord } from "./log-record.ts";
import type { LogRecord, LogStorage } from "./ports/log-storage.ts";
import type {
  PhoneLog,
  PhoneLogApp,
  PhoneLogLevel,
  PhoneLogRow,
  PhoneLogSnapshot,
} from "./public.ts";

const LOG_LIMIT = 1000;
const LOG_BYTES = 32 * 1024 * 1024;
const PENDING_BYTES = 40 * 1024 * 1024;

function createLogId() {
  // getRandomValues 也可用于通过 HTTP 访问的 SillyTavern 和独立预览。
  return [...crypto.getRandomValues(new Uint32Array(4))]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

export function createPhoneLog({
  storage,
  limit = LOG_LIMIT,
  bytes = LOG_BYTES,
  pendingBytes = PENDING_BYTES,
}: {
  storage: LogStorage;
  limit?: number;
  bytes?: number;
  pendingBytes?: number;
}): PhoneLog {
  const retention = { count: limit, bytes };
  const sessionId = createLogId();
  const listeners = new Set<() => void>();
  const pending = new Map<string, LogRecord>();
  let retainedBytes = 0;
  let rows: PhoneLogRow[] = [];
  let snapshot: PhoneLogSnapshot = {
    entries: [],
    loading: true,
    clearing: false,
    storageError: null,
    canRetry: false,
  };
  let loaded = false;
  let writePaused = false;
  let queue: Promise<void> = Promise.resolve();
  let retrying: Promise<void> | undefined;

  function publish(changes: Partial<Omit<PhoneLogSnapshot, "entries">> = {}) {
    snapshot = { ...snapshot, ...changes, entries: rows.slice(-limit) };
    for (const listener of listeners) {
      listener();
    }
  }

  function release(id: string) {
    const record = pending.get(id);
    if (record) {
      retainedBytes -= record.bytes;
      pending.delete(id);
    }
  }

  function setStatus(id: string, status: PhoneLogRow["status"]) {
    rows = rows.map((row) => (row.id === id ? { ...row, status } : row));
  }

  function enqueue(action: () => Promise<void>) {
    queue = queue.then(action);
    return queue;
  }

  async function load() {
    publish({ loading: true });
    try {
      const { entries: restored, warning } = await storage.load(retention);
      loaded = true;
      rows = [...restored.map((summary) => ({ ...summary, status: "saved" as const })), ...rows];
      publish({ loading: false, storageError: warning ?? null, canRetry: false });
    } catch (error) {
      rows = rows.map((row) => (row.status === "pending" ? { ...row, status: "unsaved" } : row));
      publish({ loading: false, storageError: `读取日志失败：${String(error)}`, canRetry: true });
    }
  }

  async function append(id: string) {
    const record = pending.get(id);
    if (!loaded || !record || record.bytes > bytes) {
      return;
    }
    if (writePaused) {
      setStatus(id, "unsaved");
      publish();
      return;
    }
    try {
      const evicted = new Set(await storage.append(record, retention));
      rows = rows.filter((row) => row.status !== "saved" || !evicted.has(row.id));
      if (evicted.has(id)) {
        setStatus(id, "unavailable");
        publish({ storageError: "本次请求日志超过保留容量，已整组清理。" });
      } else {
        setStatus(id, "saved");
        publish();
      }
      release(id);
    } catch (error) {
      // 保存恢复必须保持提交顺序，后到记录等同一批重试。
      writePaused = true;
      setStatus(id, "unsaved");
      publish({ storageError: `保存日志失败：${String(error)}`, canRetry: true });
    }
  }

  function retain(record: LogRecord) {
    // 进行中的存储操作最多持有一条额外引用。其记录仍计入预算，
    // 直到事务结束；其余候选保留至成功提交、清除或待写空间用尽。
    const id = record.summary.id;
    if (pending.size >= limit || retainedBytes + record.bytes > pendingBytes) {
      return false;
    }
    pending.set(id, record);
    retainedBytes += record.bytes;
    return true;
  }

  function write(
    level: PhoneLogLevel,
    app: PhoneLogApp,
    scope: string,
    message: string,
    details?: unknown,
  ) {
    console[level](`[${scope}]`, details === undefined ? message : details);
    const id = createLogId();
    const requestGroup = logGroupId(scope, details);
    // 传输层请求编号可在刷新后重用，只能在本次运行内按该编号归组。
    const groupId = requestGroup === undefined ? undefined : `${sessionId}:${requestGroup}`;
    const summary = {
      id,
      time: Date.now(),
      level,
      app,
      scope,
      message,
      ...(groupId && { groupId }),
    };
    const record = logRecord(summary, details === undefined ? message : formatLogDetails(details));
    const retained = retain(record);
    const canSave = retained && record.bytes <= bytes;
    const status =
      canSave && ((loaded && !writePaused) || snapshot.loading)
        ? "pending"
        : retained
          ? "unsaved"
          : "unavailable";

    // 临时摘要独立受条数限制，持久记录由存储事务决定保留范围。
    const temporary = rows.filter((row) => row.status !== "saved");
    if (temporary.length >= limit) {
      const expired = temporary.find((row) => !pending.has(row.id)) ?? temporary[0]!;
      if (expired.status !== "pending") {
        release(expired.id);
        rows = rows.filter((row) => row.id !== expired.id);
      }
    }
    rows = [...rows, { ...summary, status }];
    if (canSave) {
      void enqueue(() => append(id));
    }
    publish(
      !retained
        ? { storageError: "待写空间不足，本条日志详情无法保留。" }
        : record.bytes > bytes
          ? { storageError: "本条日志超过持久化容量，仅在当前会话中保留。" }
          : {},
    );
  }

  function retry() {
    if (retrying) {
      return retrying;
    }
    const candidates = [...pending.keys()];
    retrying = enqueue(async () => {
      if (!loaded) {
        await load();
      }
      if (!loaded) {
        return;
      }
      writePaused = false;
      if (snapshot.canRetry) {
        publish({ storageError: null, canRetry: false });
      }
      for (const id of candidates) {
        await append(id);
      }
    }).finally(() => {
      retrying = undefined;
    });
    return retrying;
  }

  async function clear() {
    if (snapshot.clearing) {
      return;
    }
    const previous = new Set(rows.map((row) => row.id));
    const clearing = enqueue(async () => {
      try {
        const warning = await storage.clear();
        loaded = true;
        writePaused = false;
        // 启动读取结果和清除前的写入都归入本次清除，随后提交的日志继续保存。
        for (const row of rows) {
          if (row.status === "saved" || previous.has(row.id)) {
            release(row.id);
          }
        }
        rows = rows.filter((row) => row.status !== "saved" && !previous.has(row.id));
        publish({ clearing: false, storageError: warning ?? null, canRetry: false });
      } catch (error) {
        publish({
          clearing: false,
          storageError: `清除日志失败：${String(error)}`,
        });
      }
    });
    publish({ clearing: true });
    await clearing;
  }

  void enqueue(load);

  return {
    info: (app, scope, message, details) => write("info", app, scope, message, details),
    warn: (app, scope, message, details) => write("warn", app, scope, message, details),
    error: (app, scope, message, details) => write("error", app, scope, message, details),
    getSnapshot: () => snapshot,
    getDetails: async (id) =>
      pending.get(id)?.content ?? (loaded ? storage.getDetails(id) : undefined),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry,
    clear,
  };
}
