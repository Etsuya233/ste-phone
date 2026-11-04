import { useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { isDiaryRunning } from "../diary.ts";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryImagePicker({
  diary,
  state,
  navigation,
  imageHub,
  id,
}: DiaryPageProps & { imageHub: ImageHub; id: string }) {
  const [images, setImages] = useState<readonly ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const [selected, setSelected] = useState(false);
  const taskBusy = state.imageTask.status !== "idle" && state.imageTask.status !== "error";
  const busy = taskBusy || isDiaryRunning(state.generation) || state.preparing;
  // Home 和关闭保留读取；出栈或切聊天卸载后忽略迟到的列表与保存结果。
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [imageHub]);
  useEffect(() => {
    if (selected && navigation.current) {
      navigation.pop();
    }
  }, [selected, navigation]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await imageHub.listImages();
      if (mounted.current) {
        setImages(result);
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause as Error).message);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }
  async function select(image: ImageRecord) {
    if (busy) {
      return;
    }
    setError(null);
    try {
      await diary.selectImage(id, image);
      if (mounted.current) {
        setSelected(true);
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause as Error).message);
      }
    }
  }
  return (
    <DiaryPage
      state={state}
      title="选择配图"
      onBack={navigation.pop}
      backLabel="日记"
      error={error}
      right={
        <Button disabled={loading} onClick={() => void refresh()}>
          刷新
        </Button>
      }
    >
      {loading ? (
        <p className="diary-message" role="status">
          正在翻阅图库…
        </p>
      ) : null}
      {taskBusy ? (
        <p className="diary-message" role="status">
          正在保存配图…
        </p>
      ) : null}
      <div className="diary-image-picker" inert={busy || selected}>
        <ImageGrid
          images={images}
          onOpen={(image) => void select(image)}
          empty={loading ? "" : "图库还没有图片。"}
        />
      </div>
    </DiaryPage>
  );
}

export function DiaryImageView({ state, navigation, id }: DiaryPageProps & { id: string }) {
  const entry = state.data.entries.find((item) => item.id === id);
  return (
    <DiaryPage state={state} title="配图" onBack={navigation.pop} backLabel="日记">
      {entry?.image ? (
        <figure className="diary-image-full">
          <img src={entry.image.imagePath} alt={entry.imagePrompt ?? "日记配图"} />
        </figure>
      ) : (
        <p className="diary-message">这篇日记还没有配图。</p>
      )}
    </DiaryPage>
  );
}
