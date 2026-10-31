import type { SourceContext } from "./background-provider.ts";
import type { DatabaseSchema, QueryResult, SqlValue } from "../database.ts";
export interface DatabaseProvider {
  getContext(): SourceContext;
  subscribe(listener: () => void): () => void;
  describe(): Promise<DatabaseSchema>;
  register(schema: DatabaseSchema): Promise<void>;
  query(
    schema: DatabaseSchema,
    sql: string,
    params?: Readonly<Record<string, SqlValue>>,
  ): Promise<QueryResult>;
}
