import { appCatalog } from "../../core/launcher/catalog.ts";
import { logGroupId, logRecord } from "../../apps/logs/log-record.ts";
import type { LogRecord } from "../../apps/logs/ports/log-storage.ts";
import type { PhoneLogSummary } from "../../apps/logs/public.ts";

interface LegacyEntry extends Omit<PhoneLogSummary, "id" | "groupId"> {
  id: number;
  details?: string;
}

export function readLegacyLogs(raw: string): LogRecord[] {
  const value = JSON.parse(raw) as { version?: unknown; entries?: unknown };
  if (
    value?.version !== 1 ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isLegacyEntry)
  ) {
    throw new Error("旧版日志格式无效，原数据仍在 LocalStorage。");
  }
  const groups = new Map<string, string>();
  return value.entries.map(({ id, details, ...entry }: LegacyEntry) => {
    let groupId: string | undefined;
    if (entry.scope === "STE Phone AI" && details !== undefined) {
      try {
        const parsed: unknown = JSON.parse(details);
        const request = logGroupId(entry.scope, parsed);
        if (request !== undefined) {
          // 旧编号可能跨刷新重复；每次 request 事件开启一组。
          if (
            !groups.has(request) ||
            (typeof parsed === "object" &&
              parsed !== null &&
              "event" in parsed &&
              parsed.event === "request")
          ) {
            groups.set(request, `legacy-group:${id}`);
          }
          groupId = groups.get(request);
        }
      } catch {
        // 旧日志允许纯文本详情，原文照常迁移。
      }
    }
    return logRecord(
      { ...entry, id: `legacy:${id}`, ...(groupId && { groupId }) },
      details ?? entry.message,
    );
  });
}

function isLegacyEntry(value: unknown): value is LegacyEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<LegacyEntry>;
  return (
    typeof entry.id === "number" &&
    Number.isSafeInteger(entry.id) &&
    typeof entry.time === "number" &&
    Number.isFinite(entry.time) &&
    (entry.level === "info" || entry.level === "warn" || entry.level === "error") &&
    typeof entry.app === "string" &&
    (entry.app === "system" || Object.hasOwn(appCatalog, entry.app)) &&
    typeof entry.scope === "string" &&
    typeof entry.message === "string" &&
    (entry.details === undefined || typeof entry.details === "string")
  );
}
