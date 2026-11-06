import type { PhoneLogSummary } from "../public.ts";

export interface LogRetention {
  readonly count: number;
  readonly bytes: number;
}

export interface LogRecord {
  readonly summary: PhoneLogSummary;
  readonly content: string;
  readonly bytes: number;
}

export interface LogStorage {
  load(retention: LogRetention): Promise<{ entries: readonly PhoneLogSummary[]; warning?: string }>;
  /** 返回同一事务中淘汰的记录 ID。 */
  append(record: LogRecord, retention: LogRetention): Promise<readonly string[]>;
  getDetails(id: string): Promise<string | undefined>;
  clear(): Promise<string | undefined>;
}
