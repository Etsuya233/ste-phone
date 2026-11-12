import type { NotesStorage } from "../../apps/notes/notes.ts";
import { encodeBase64 } from "../browser/base64.ts";

const filename = "ste-phone-notes.json";
const filePath = `/user/files/${filename}`;

/** ST locates the file under the authenticated user's own data directory. */
export function createStNotesStorage(
  getRequestHeaders: () => HeadersInit = () => window.SillyTavern.getContext().getRequestHeaders(),
  request = fetch,
): NotesStorage {
  async function post(path: string, body: unknown, action: string) {
    const response = await request(path, {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${action}失败（${response.status}）`);
    }
    return response.json();
  }

  return {
    async read() {
      const checked: Record<string, unknown> = await post(
        "/api/files/verify",
        { urls: [filePath] },
        "检查备忘录文件",
      );
      const exists = checked[filePath];
      if (exists === false) {
        return null;
      }
      if (exists !== true) {
        throw new Error("宿主返回了无效的备忘录文件检查结果");
      }
      const response = await request(filePath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`读取备忘录失败（${response.status}）`);
      }
      const data: unknown = await response.json();
      if (data === null) {
        throw new Error("备忘录文件没有有效数据");
      }
      return data;
    },
    async write(notes) {
      const data = encodeBase64(new TextEncoder().encode(JSON.stringify(notes)));
      const saved: { path?: unknown } = await post(
        "/api/files/upload",
        { name: filename, data },
        "保存备忘录",
      );
      if (saved.path !== filePath) {
        throw new Error("宿主返回了意外的备忘录文件路径");
      }
    },
  };
}
