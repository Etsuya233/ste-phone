import type { AppId } from "../../core/launcher/catalog.ts";
import { createPhoneLog } from "./log-store.ts";

export type { LogStorage } from "./ports/log-storage.ts";

export type PhoneLogLevel = "info" | "warn" | "error";
export type PhoneLogApp = AppId | "system";

export interface PhoneLogEntry {
  readonly id: number;
  readonly time: number;
  readonly level: PhoneLogLevel;
  readonly app: PhoneLogApp;
  readonly scope: string;
  readonly message: string;
  readonly details?: string;
}

/** 日志按应用标记来源；details 在写入时格式化为可持久化文本。 */
export interface PhoneLog {
  info(app: PhoneLogApp, scope: string, message: string, details?: unknown): void;
  warn(app: PhoneLogApp, scope: string, message: string, details?: unknown): void;
  error(app: PhoneLogApp, scope: string, message: string, details?: unknown): void;
  getSnapshot(): readonly PhoneLogEntry[];
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export { createPhoneLog };
