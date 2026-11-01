import type { DiaryAuthor, DiaryData, DiaryEntry } from "../../src/apps/diary/diary.ts";
import type { DiaryStorage } from "../../src/apps/diary/ports/diary-storage.ts";

const demoAuthor: DiaryAuthor = {
  id: "red",
  name: "小红",
  profileText: "直率，习惯把细小的事情记在本子上。",
  sourceId: "ste-memory",
  scopeId: "preview-space",
};

const demoEntryAuthor: Omit<DiaryAuthor, "profileText"> = {
  id: demoAuthor.id,
  name: demoAuthor.name,
  sourceId: demoAuthor.sourceId,
  scopeId: demoAuthor.scopeId,
};

const demoEntries: DiaryEntry[] = [
  {
    id: "demo-1",
    author: demoEntryAuthor,
    worldTime: "2026-10-30 16:45:00",
    createdAt: "2026-10-31T14:20:00.000Z",
    body: "图书馆的窗子开着一条缝，风把稿纸吹得哗啦响。我把蓝色笔记本推给小蓝的时候，他没有立刻翻开，先问我要不要一起去买热牛奶。\n\n周五的朗读会忽然就不那么吓人了。有人愿意陪我一遍一遍地校对，连标点都认真看过，这件事本身已经足够让人安心。",
  },
  {
    id: "demo-2",
    author: {
      id: "blue",
      name: "小蓝",
      sourceId: "ste-memory",
      scopeId: "preview-space",
    },
    worldTime: "2026-10-29 19:10:00",
    createdAt: "2026-10-30T02:10:00.000Z",
    body: "她今天穿的是那件有淡淡洗衣粉味道的秋季校服，坐在窗边时，总喜欢把笔帽咬在嘴里。\n\n我把最后一版稿件交给她，她只说了一句“辛苦了”，然后低头笑了一下。回去的路上风很凉，我却一直记得那个笑。",
  },
  {
    id: "demo-3",
    author: demoEntryAuthor,
    worldTime: "2026-10-27 21:30:00",
    createdAt: "2026-10-28T13:30:00.000Z",
    body: "晚饭后把书桌收拾了一遍，翻出去年文学社的合影。照片里的自己站得很直，像是怕别人看出紧张。\n\n今年大概还是这样。不过至少现在，我知道紧张的时候可以给谁发一条消息。",
  },
];

const demoDiary: DiaryData = {
  version: 1,
  author: demoAuthor,
  settings: { timeoutSeconds: 300, maxTokens: 10240 },
  entries: demoEntries,
};

/** Preview business data remains separate from ST, including refresh recovery. */
export function createPreviewDiaryStorage(mode: string | null): DiaryStorage {
  const key = (chatId: string) => `ste-phone-preview-diary:${chatId}`;
  return {
    read(chatId) {
      const saved = localStorage.getItem(key(chatId));
      if (saved === null) {
        return mode === "demo" ? demoDiary : null;
      }
      const data = JSON.parse(saved) as DiaryData;
      if (data.version !== 1) {
        throw new Error("日记数据版本不受支持");
      }
      return data;
    },
    async write(chatId, data) {
      if (mode === "save-error") {
        throw new Error("预览：日记保存失败");
      }
      localStorage.setItem(key(chatId), JSON.stringify(data));
    },
  };
}
