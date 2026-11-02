/** 日志持久化只关心一段字符串，具体介质由基础设施提供。 */
export interface LogStorage {
  read(): string | null;
  write(value: string): void;
  clear(): void;
}
