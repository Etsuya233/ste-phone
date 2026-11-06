import type { LogRecord } from "./ports/log-storage.ts";
import type { PhoneLogSummary } from "./public.ts";

export function logGroupId(scope: string, details: unknown): string | undefined {
  if (
    scope === "STE Phone AI" &&
    typeof details === "object" &&
    details !== null &&
    "requestId" in details &&
    typeof details.requestId === "string"
  ) {
    return `ai:${details.requestId}`;
  }
}

export function logRecord(summary: PhoneLogSummary, content: string): LogRecord {
  // 用 UTF-8 字节作保留预算，实际浏览器配额还包含索引和内部存储开销。
  const encoder = new TextEncoder();
  const bytes =
    encoder.encode(content).byteLength + encoder.encode(JSON.stringify(summary)).byteLength;
  return { summary, content, bytes };
}
