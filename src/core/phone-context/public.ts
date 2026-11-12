/** 应用拥有 Intent 配置；ST 只引用稳定 ID，同步读取已确认保存的内容。 */
export interface AppIntentSource {
  readonly id: string;
  readonly label: string;
  listIntents(chatId: string): readonly { readonly id: string; readonly name: string }[];
  readIntent(request: {
    readonly chatId: string;
    readonly intentId: string;
    readonly now: number;
  }): string;
}
