import { appCatalog } from "../../core/launcher/catalog.ts";
import { formatLogDetails } from "./log-format.ts";
import type { LogStorage } from "./ports/log-storage.ts";
import type { PhoneLog, PhoneLogApp, PhoneLogEntry, PhoneLogLevel } from "./public.ts";

const STORAGE_VERSION = 1;
export const PHONE_LOG_LIMIT = 1000;

interface StoredLogs {
  version: number;
  nextId: number;
  entries: PhoneLogEntry[];
}

/** 日志先服务当前会话，再尽力写入浏览器本地存储；一条日志写失败不应影响业务。 */
export function createPhoneLog({
  storage,
  limit = PHONE_LOG_LIMIT,
}: {
  storage: LogStorage;
  limit?: number;
}): PhoneLog {
  const restored = readStoredLogs(storage, limit);
  let entries = restored?.entries ?? [];
  let nextId = restored?.nextId ?? 1;
  const listeners = new Set<() => void>();

  function write(
    level: PhoneLogLevel,
    app: PhoneLogApp,
    scope: string,
    message: string,
    details?: unknown,
  ) {
    const entry: PhoneLogEntry = {
      id: nextId++,
      time: Date.now(),
      level,
      app,
      scope,
      message,
      ...(details === undefined ? {} : { details: formatLogDetails(details) }),
    };
    const output =
      level === "info" ? console.info : level === "warn" ? console.warn : console.error;
    output(`[${scope}]`, details === undefined ? message : details);
    entries = [...entries, entry].slice(-limit);
    persist(storage, entries, nextId);
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    info: (app, scope, message, details) => write("info", app, scope, message, details),
    warn: (app, scope, message, details) => write("warn", app, scope, message, details),
    error: (app, scope, message, details) => write("error", app, scope, message, details),
    getSnapshot: () => entries,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear: () => {
      entries = [];
      try {
        storage.clear();
      } catch {
        // 本地存储不可用时仍清空本次会话的记录。
      }
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function persist(storage: LogStorage, entries: readonly PhoneLogEntry[], nextId: number) {
  let stored = entries;
  while (true) {
    try {
      storage.write(JSON.stringify({ version: STORAGE_VERSION, nextId, entries: stored }));
      return;
    } catch {
      // 本地存储配额不足时保留最新记录，内存中的完整日志不受影响。
      if (stored.length === 0) {
        return;
      }
      stored = stored.slice(Math.ceil(stored.length / 2));
    }
  }
}

function readStoredLogs(storage: LogStorage, limit: number) {
  try {
    const raw = storage.read();
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as Partial<StoredLogs>;
    if (value.version !== STORAGE_VERSION || !Array.isArray(value.entries)) {
      return null;
    }
    const entries = value.entries.filter(isPhoneLogEntry).slice(-limit);
    const maxId = entries.at(-1)?.id ?? 0;
    const nextId =
      typeof value.nextId === "number" && value.nextId > maxId ? value.nextId : maxId + 1;
    return { entries, nextId };
  } catch {
    return null;
  }
}

function isPhoneLogEntry(value: unknown): value is PhoneLogEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<PhoneLogEntry>;
  return (
    typeof entry.id === "number" &&
    typeof entry.time === "number" &&
    (entry.level === "info" || entry.level === "warn" || entry.level === "error") &&
    typeof entry.app === "string" &&
    (entry.app === "system" || Object.hasOwn(appCatalog, entry.app)) &&
    typeof entry.scope === "string" &&
    typeof entry.message === "string" &&
    (entry.details === undefined || typeof entry.details === "string")
  );
}
