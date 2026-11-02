import type { LogStorage } from "../../apps/logs/ports/log-storage.ts";

/** 生产和独立预览都在浏览器里运行，日志直接保存在各自站点的 LocalStorage。 */
export function createLocalStorageLogStorage(key: string): LogStorage {
  return {
    read: () => localStorage.getItem(key),
    write: (value) => localStorage.setItem(key, value),
    clear: () => localStorage.removeItem(key),
  };
}
