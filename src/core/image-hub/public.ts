/** Hub 拥有生成与保存；Phone 只消费图片记录，不读取 Hub 存储。 */
export interface ImageRecord {
  readonly id: string;
  readonly imagePath: string;
  readonly prompt: string;
  readonly startedAt: string;
  readonly savedAt: string;
}
export interface ImageHub {
  listImages(): Promise<readonly ImageRecord[]>;
  generate(input: { prompt: string }): Promise<readonly ImageRecord[]>;
}
