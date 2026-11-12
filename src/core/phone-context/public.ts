/** App 负责解释人物与分组；所有读取均同步，只消费当前聊天已确认保存的数据。 */
export interface ContextSelection {
  readonly scopeId: string;
  readonly personIds: readonly string[];
  readonly recentMinutes: number | null;
  readonly limitPerGroup: number;
}

export interface ContextScope {
  readonly id: string;
  readonly label: string;
  readonly people: readonly { readonly id: string; readonly name: string }[];
}

export interface ContextResult {
  readonly text: string;
  readonly itemCount: number;
  readonly groupCount: number;
  readonly excluded: { readonly barrier: number; readonly time: number; readonly limit: number };
}

export interface ContextSource {
  readonly id: string;
  readonly label: string;
  readonly minimumPeople: number;
  validateSelection(selection: ContextSelection): void;
  listScopes(chatId: string): readonly ContextScope[];
  read(request: {
    readonly chatId: string;
    readonly selection: ContextSelection;
    readonly now: number;
  }): ContextResult;
}
