import type { AppId } from "../../core/launcher/catalog.ts";
import { createPhoneLog } from "./log-store.ts";

export type { LogStorage } from "./ports/log-storage.ts";

export type PhoneLogLevel = "info" | "warn" | "error";
export type PhoneLogApp = AppId | "system";

export interface PhoneLogSummary {
  readonly id: string;
  readonly groupId?: string;
  readonly time: number;
  readonly level: PhoneLogLevel;
  readonly app: PhoneLogApp;
  readonly scope: string;
  readonly message: string;
}

export interface PhoneLogRow extends PhoneLogSummary {
  readonly status: "pending" | "saved" | "unsaved" | "unavailable";
}

export interface PhoneLogSnapshot {
  readonly entries: readonly PhoneLogRow[];
  readonly loading: boolean;
  readonly clearing: boolean;
  readonly storageError: string | null;
  readonly canRetry: boolean;
}

/** 业务只提交日志。详情读取、持久化恢复和清除由日志应用发起。 */
export interface PhoneLog {
  info(app: PhoneLogApp, scope: string, message: string, details?: unknown): void;
  warn(app: PhoneLogApp, scope: string, message: string, details?: unknown): void;
  error(app: PhoneLogApp, scope: string, message: string, details?: unknown): void;
  getSnapshot(): PhoneLogSnapshot;
  getDetails(id: string): Promise<string | undefined>;
  subscribe(listener: () => void): () => void;
  retry(): Promise<void>;
  clear(): Promise<void>;
}

export { createPhoneLog };
