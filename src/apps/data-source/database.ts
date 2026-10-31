/** Phone 拥有查询结构，来源执行 SQL；这里不保存源记录。 */
export type SqlValue = string | number | null;
export interface DatabaseColumn {
  readonly name: string;
  readonly type: "TEXT" | "INTEGER" | "REAL";
  readonly description: string;
  readonly sourceFieldId?: string;
  readonly reference?: {
    readonly table: string;
    readonly column: string;
    readonly multiple: boolean;
  };
}
export interface DatabaseObject {
  readonly name: string;
  readonly kind: "table" | "view";
  readonly description: string;
  readonly columns: readonly DatabaseColumn[];
  readonly select?: string;
}
export interface DatabaseSchema {
  readonly sourceId: string;
  readonly scopeId: string;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly schemaKey: string;
  readonly databaseKey: string;
  readonly objects: readonly DatabaseObject[];
}
export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqlValue[])[];
  readonly elapsedMs: number;
  readonly truncated: boolean;
  readonly maxRows: number;
}
/** SQLite 标识符引用。保留来源原始 key，双引号是 key 的一部分时按 SQL 规则转义。 */
export function quoteIdentifier(value: string): string {
  if (!value || value.includes("\0")) throw new Error("SQLite 对象名不能为空或包含 NUL");
  return `"${value.replaceAll('"', '""')}"`;
}

/** SQLite 仅对 ASCII 大小写折叠；碰撞判断与原生标识符一致。 */
export function identifierKey(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}
