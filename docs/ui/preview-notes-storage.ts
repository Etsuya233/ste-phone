import type { NotesData, NotesRole, NotesStorage } from "../../src/apps/notes/notes.ts";

const red: NotesRole = {
  sourceId: "ste-memory",
  scopeId: "preview-space",
  id: "red",
  name: "小红",
};
const blue: NotesRole = { ...red, id: "blue", name: "小蓝" };
const demo: NotesData = {
  version: 1,
  lastRole: red,
  entries: [
    {
      id: "preview-weekend",
      role: red,
      createdAt: "2026-11-12T08:00:00.000Z",
      updatedAt: "2026-11-12T08:00:00.000Z",
      blocks: [
        { type: "paragraph", text: "周末计划" },
        { type: "paragraph", text: "先去图书馆还书，路过花店时带一束向日葵。" },
        { type: "paragraph", text: "如果天气好，沿着河边慢慢走回来。" },
      ],
    },
    {
      id: "preview-reading",
      role: red,
      createdAt: "2026-11-10T09:00:00.000Z",
      updatedAt: "2026-11-10T09:00:00.000Z",
      blocks: [
        { type: "paragraph", text: "朗读会要带的东西" },
        { type: "paragraph", text: "校对过的稿件、蓝色笔记本、保温杯。" },
      ],
    },
    {
      id: "preview-book",
      role: blue,
      createdAt: "2026-11-11T09:00:00.000Z",
      updatedAt: "2026-11-11T09:00:00.000Z",
      blocks: [{ type: "paragraph", text: "把蓝色笔记本带去图书馆" }],
    },
  ],
};

export function createPreviewNotesStorage(mode: string | null): NotesStorage {
  const key = `ste-phone-preview-notes-v1:${mode ?? "default"}`;
  let shouldFail = mode === "save-error";
  return {
    async read() {
      const saved = localStorage.getItem(key);
      return saved === null
        ? mode === "demo" || mode === "save-error"
          ? demo
          : null
        : JSON.parse(saved);
    },
    async write(notes) {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("预览：备忘录首次保存失败");
      }
      localStorage.setItem(key, JSON.stringify(notes));
    },
  };
}
