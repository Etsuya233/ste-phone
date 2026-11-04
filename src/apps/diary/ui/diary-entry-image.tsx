import type { DiaryEntry, DiaryImageTask } from "../diary.ts";
import { isDiaryImageTaskRunning, isDiaryRunning } from "../diary.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { DiaryPageProps } from "./diary-page.tsx";
import { DiaryImageActions } from "./diary-image-actions.tsx";
import { DiaryPhoto } from "./diary-photo.tsx";

function imageTaskText(task: DiaryImageTask): string | null {
  switch (task.status) {
    case "prompting":
      return "正在构思画面…";
    case "generating":
      return "正在生成配图…";
    case "saving":
      return "正在保存配图…";
    default:
      return null;
  }
}

export function DiaryEntryImage({
  entry,
  state,
  navigation,
  onRequestRemove,
}: Pick<DiaryPageProps, "state" | "navigation"> & {
  entry: DiaryEntry;
  onRequestRemove: () => void;
}) {
  const task = state.imageTask;
  const ownTask = task.status !== "idle" && task.entryId === entry.id;
  const status = ownTask ? imageTaskText(task) : null;
  const error = ownTask && task.status === "error" ? task.error.message : null;
  const busy = isDiaryImageTaskRunning(task) || isDiaryRunning(state.generation) || state.preparing;

  if (!entry.image) {
    return (
      <section className="diary-entry-image" aria-label="日记配图">
        <div
          className={`diary-photo-empty${status ? " diary-photo-empty--working" : ""}`}
          role={status ? "status" : undefined}
        >
          <p className="diary-photo-empty-title">{status ?? "这一页还没有配图"}</p>
          {status ? null : (
            <p className="diary-photo-empty-note">从图库挑一张，或者把文字变成一张照片。</p>
          )}
        </div>
        {error ? (
          <p className="diary-error" role="alert">
            {error}
          </p>
        ) : null}
        {status ? null : (
          <div className="diary-entry-image-buttons">
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
        )}
      </section>
    );
  }

  return (
    <section className="diary-entry-image" aria-label="日记配图">
      <DiaryPhoto
        image={entry.image}
        prompt={entry.imagePrompt}
        onOpen={() => navigation.push({ page: "image-view", id: entry.id })}
      />
      {status ? (
        <p className="diary-entry-image-status" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="diary-error" role="alert">
          {error}
        </p>
      ) : null}
      <DiaryImageActions
        busy={busy}
        onPick={() => navigation.push({ page: "image-picker", id: entry.id })}
        onPrompt={() => navigation.push({ page: "image-prompt", id: entry.id })}
        onRemove={onRequestRemove}
      />
    </section>
  );
}
