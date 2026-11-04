import type { DiaryEntry } from "../diary.ts";
import { isDiaryRunning } from "../diary.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { DiaryPageProps } from "./diary-page.tsx";

export function DiaryEntryImage({
  entry,
  state,
  navigation,
}: Pick<DiaryPageProps, "state" | "navigation"> & { entry: DiaryEntry }) {
  const task = state.imageTask;
  const running = task.status !== "idle" && task.status !== "error";
  const busy = running || isDiaryRunning(state.generation) || state.preparing;
  const ownTask = task.status !== "idle" && task.entryId === entry.id;
  return (
    <section className="diary-entry-image" aria-label="日记配图">
      {entry.image ? (
        <button
          type="button"
          className="diary-image-preview"
          aria-label="查看日记配图"
          onClick={() => navigation.push({ page: "image-view", id: entry.id })}
        >
          <img src={entry.image.imagePath} alt={entry.imagePrompt ?? "日记配图"} loading="lazy" />
        </button>
      ) : null}
      {ownTask && running ? (
        <p role="status">
          {task.status === "saving"
            ? "正在保存配图…"
            : task.status === "prompting"
              ? "正在构思画面…"
              : "正在生成配图…"}
        </p>
      ) : null}
      {ownTask && task.status === "error" ? (
        <p className="diary-error" role="alert">
          {task.error.message}
        </p>
      ) : null}
      <div className="diary-write-buttons">
        <Button
          disabled={busy}
          onClick={() => navigation.push({ page: "image-picker", id: entry.id })}
        >
          从图库选择
        </Button>
        <Button
          disabled={busy}
          onClick={() => navigation.push({ page: "image-prompt", id: entry.id })}
        >
          生成配图
        </Button>
      </div>
    </section>
  );
}
