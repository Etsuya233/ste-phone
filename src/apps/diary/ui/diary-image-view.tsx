import { useEffect, useRef, useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { isDiaryImageTaskRunning, isDiaryRunning } from "../diary.ts";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiaryImageActions } from "./diary-image-actions.tsx";
import { DiaryPhoto } from "./diary-photo.tsx";

export function DiaryImageView({ diary, state, navigation, id }: DiaryPageProps & { id: string }) {
  const entry = state.data.entries.find((item) => item.id === id);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy =
    isDiaryImageTaskRunning(state.imageTask) || isDiaryRunning(state.generation) || state.preparing;
  const saving = state.imageTask.status === "saving" && state.imageTask.entryId === id;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 移除成功后离开大图；在后台完成时等回到前台再返回。
  useEffect(() => {
    if (removed && navigation.current) {
      navigation.pop();
    }
  }, [removed, navigation]);

  async function removeImage() {
    // 确认框立即收起，任务进度和失败由页内提示承担，避免重复点击。
    setRemoving(false);
    setError(null);
    try {
      await diary.removeImage(id);
      if (mounted.current) {
        setRemoved(true);
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause as Error).message);
      }
    }
  }

  if (!entry) {
    return (
      <DiaryPage state={state} title="配图" onBack={navigation.pop} backLabel="日记">
        <p className="diary-message">这篇日记已经不在日记本里了。</p>
      </DiaryPage>
    );
  }

  const actions = (
    <DiaryImageActions
      busy={busy}
      onPick={() => navigation.push({ page: "image-picker", id: entry.id })}
      onPrompt={() => navigation.push({ page: "image-prompt", id: entry.id })}
      onRemove={entry.image ? () => setRemoving(true) : undefined}
    />
  );

  return (
    <>
      <DiaryPage
        state={state}
        title="配图"
        onBack={navigation.pop}
        backLabel="日记"
        inert={removing}
        error={error}
      >
        {entry.image ? (
          <div className="diary-image-view">
            <DiaryPhoto image={entry.image} prompt={entry.imagePrompt} large />
            {saving ? (
              <p className="diary-entry-image-status" role="status">
                正在保存配图…
              </p>
            ) : null}
            {actions}
          </div>
        ) : (
          <div className="diary-image-view">
            <p className="diary-image-empty">这一页还没有配图，可以换一张或重新生成。</p>
            {saving ? (
              <p className="diary-entry-image-status" role="status">
                正在保存配图…
              </p>
            ) : null}
            {actions}
          </div>
        )}
      </DiaryPage>
      {removing ? (
        <Alert
          title="移除这一页的配图？"
          active={navigation.current}
          onDismiss={() => setRemoving(false)}
          actions={[
            { label: "保留", onClick: () => setRemoving(false), primary: true },
            { label: "移除", onClick: () => void removeImage() },
          ]}
        >
          <p>图片仍保留在图库，配图描述也会保留。</p>
        </Alert>
      ) : null}
    </>
  );
}
