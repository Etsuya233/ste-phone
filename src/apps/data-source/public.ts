import type { PhoneBackground } from "./background.ts";
import type { SourceContext } from "./ports/background-provider.ts";
import type { DatabaseSchema, QueryResult, SqlValue } from "./database.ts";
import type { RecentChatSnapshot } from "./recent-chat.ts";
export type { RecentChatSnapshot, RecentChatMessage } from "./recent-chat.ts";
export type { CharacterProfile, Chronicle, ItemProfile, PhoneBackground } from "./background.ts";
export type { SourceContext } from "./ports/background-provider.ts";
export type {
  DatabaseColumn,
  DatabaseObject,
  DatabaseSchema,
  QueryResult,
  SqlValue,
} from "./database.ts";
export { quoteIdentifier } from "./database.ts";
export interface DataScope {
  readonly chatIdentity: string | null;
  readonly scopeId: string | null;
}
export interface DataQuery extends DataScope {
  readonly sql: string;
  readonly params?: Readonly<Record<string, SqlValue>>;
}
export interface BackgroundRead extends DataScope {
  readonly force?: boolean;
}
export interface DataSourceSnapshot {
  readonly sourceId: string | null;
  readonly context: SourceContext;
  readonly status: "unavailable" | "idle" | "loading" | "ready" | "error";
  readonly data: PhoneBackground | null;
  readonly stale: boolean;
  readonly error: string | null;
  readonly loadedAt: string | null;
  readonly revision: number;
}
export interface DataAppPublic {
  getSnapshot(): DataSourceSnapshot;
  subscribe(listener: () => void): () => void;
  readBackground(request: BackgroundRead): Promise<PhoneBackground>;
  describe(request: DataScope, options?: { readonly force?: boolean }): Promise<DatabaseSchema>;
  query(request: DataQuery): Promise<QueryResult>;
  readRecentChat(request: DataScope & { readonly count: number }): Promise<RecentChatSnapshot>;
}
