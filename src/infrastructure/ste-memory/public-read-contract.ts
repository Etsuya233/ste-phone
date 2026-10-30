/**
 * STE Memory 公共读取 v1 的最小结构契约，只在该适配器内使用。
 * 两个扩展独立构建，因此不导入相邻仓库源码，也不把来源类型泄漏给手机 App。
 */
export interface MemoryField {
  readonly id: string;
  readonly tableId: string;
  readonly key: string;
  readonly name: string;
  readonly type:
    | "short_text"
    | "long_text"
    | "short_text_list"
    | "integer"
    | "decimal"
    | "boolean"
    | "date"
    | "datetime"
    | "single_select"
    | "multi_select"
    | "single_reference"
    | "multi_reference";
  readonly enabled: boolean;
  readonly position: number;
  readonly referenceTableId: string | null;
}

export interface MemoryTable {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly displayStrategy:
    | { readonly type: "field"; readonly fieldId: string }
    | { readonly type: "template"; readonly template: string }
    | null;
}

export interface MemoryRecord {
  readonly id: string;
  readonly tableId: string;
  readonly payload: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
  readonly displayText: string;
  readonly createdAt: string;
}

export interface MemorySnapshot {
  readonly space: { readonly id: string; readonly name: string };
  readonly tables: readonly MemoryTable[];
  readonly fields: readonly MemoryField[];
  readonly records: readonly MemoryRecord[];
}

export interface MemoryContext {
  readonly revision: number;
  readonly chatIdentity: string | null;
  readonly chatName: string | null;
  readonly spaceId: string | null;
  readonly spaceName: string | null;
  readonly available: boolean;
  readonly message: string | null;
}

export interface MemoryReadApi {
  readonly version: number;
  getContext(): MemoryContext;
  subscribe(listener: () => void): () => void;
  read(): Promise<{ readonly context: MemoryContext; readonly snapshot: MemorySnapshot }>;
}
