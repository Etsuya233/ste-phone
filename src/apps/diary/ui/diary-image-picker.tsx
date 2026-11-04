import { useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { isDiaryImageTaskRunning, isDiaryRunning, type DiaryEntry } from "../diary.ts";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiaryPhoto } from "./diary-photo.tsx";

/** 图库读取归页面所有；刷新保留已有网格，卸载或更新的读取结果按序号丢弃。 */
function usePickerImages(imageHub: ImageHub) {
  const [images, setImages] = useState<readonly ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const latestRead = useRef(0);

  useEffect(() => {
    mounted.current = true;
    void load("initial");
    return () => {
      mounted.current = false;
      latestRead.current += 1;
    };
  }, [imageHub]);

  async function load(kind: "initial" | "refresh") {
    const readId = ++latestRead.current;
    if (kind === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await imageHub.listImages();
      if (mounted.current && readId === latestRead.current) {
        setImages(result);
      }
    } catch (cause) {
      if (mounted.current && readId === latestRead.current) {
        setError((cause as Error).message);
      }
    } finally {
      if (mounted.current && readId === latestRead.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  return { images, loading, refreshing, error, load };
}

/** 选图分网格和页内预览两步；保存成功后才回到日记页。 */
export function DiaryImagePicker({
  diary,
  state,
  navigation,
  imageHub,
  id,
}: DiaryPageProps & { imageHub: ImageHub; id: string }) {
  const entry = state.data.entries.find((item) => item.id === id);
  const { images, loading, refreshing, error: listError, load } = usePickerImages(imageHub);
  const [preview, setPreview] = useState<ImageRecord | null>(null);
  const [working, setWorking] = useState(false);
  const [chosen, setChosen] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const mounted = useRef(false);
  const error = selectError ?? listError;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 保存成功后离开；若当时在后台，等回到前台再返回阅读页。
  useEffect(() => {
    if (chosen && navigation.current) {
      navigation.pop();
    }
  }, [chosen, navigation]);

  const taskBusy = isDiaryImageTaskRunning(state.imageTask);
  const busy = working || chosen || taskBusy || isDiaryRunning(state.generation) || state.preparing;

  async function useImage(image: ImageRecord) {
    setWorking(true);
    setSelectError(null);
    try {
      await diary.selectImage(id, image);
      if (mounted.current) {
        setChosen(true);
      }
    } catch (cause) {
      if (mounted.current) {
        setSelectError((cause as Error).message);
      }
    } finally {
      if (mounted.current) {
        setWorking(false);
      }
    }
  }

  if (!entry) {
    return (
      <DiaryPage state={state} title="选择配图" onBack={navigation.pop} backLabel="日记">
        <p className="diary-message">这篇日记已经不在日记本里了。</p>
      </DiaryPage>
    );
  }

  if (preview) {
    return (
      <DiaryPage
        state={state}
        title="预览配图"
        onBack={() => setPreview(null)}
        backLabel="返回"
        error={error}
      >
        <ImagePickerPreview
          entry={entry}
          image={preview}
          busy={busy}
          onUse={() => void useImage(preview)}
          onBack={() => setPreview(null)}
        />
      </DiaryPage>
    );
  }

  return (
    <DiaryPage
      state={state}
      title="选择配图"
      onBack={navigation.pop}
      backLabel="日记"
      error={error}
      right={
        <Button disabled={loading || refreshing || busy} onClick={() => void load("refresh")}>
          刷新
        </Button>
      }
    >
      <ImagePickerGrid
        selectedId={entry.image?.id}
        images={images}
        loading={loading}
        refreshing={refreshing}
        listError={listError}
        taskBusy={taskBusy}
        busy={busy}
        onPreview={setPreview}
      />
    </DiaryPage>
  );
}

function ImagePickerGrid({
  selectedId,
  images,
  loading,
  refreshing,
  listError,
  taskBusy,
  busy,
  onPreview,
}: {
  selectedId?: string;
  images: readonly ImageRecord[];
  loading: boolean;
  refreshing: boolean;
  listError: string | null;
  taskBusy: boolean;
  busy: boolean;
  onPreview: (image: ImageRecord) => void;
}) {
  return (
    <>
      {loading ? (
        <p className="diary-message" role="status">
          正在翻阅图库…
        </p>
      ) : null}
      {refreshing ? (
        <p className="diary-message" role="status">
          正在刷新图库…
        </p>
      ) : null}
      {taskBusy ? (
        <p className="diary-message" role="status">
          正在保存配图…
        </p>
      ) : null}
      <div className="diary-image-picker" inert={busy}>
        {loading || (images.length === 0 && listError) ? null : (
          <ImageGrid
            images={images}
            selectedId={selectedId}
            onOpen={onPreview}
            empty="图库还没有图片。"
          />
        )}
      </div>
    </>
  );
}

function ImagePickerPreview({
  entry,
  image,
  busy,
  onUse,
  onBack,
}: {
  entry: DiaryEntry;
  image: ImageRecord;
  busy: boolean;
  onUse: () => void;
  onBack: () => void;
}) {
  const current = image.id === entry.image?.id;
  return (
    <div className="diary-image-picker-preview" inert={busy}>
      <DiaryPhoto image={image} prompt={image.prompt} large />
      <p className="diary-image-saved-at">{new Date(image.savedAt).toLocaleString()}</p>
      {current ? (
        <p className="diary-image-current-note" role="status">
          这一页正在使用这张图。
        </p>
      ) : entry.image ? (
        <p className="diary-image-replace-note">使用后会替换这一页现有的配图。</p>
      ) : null}
      <div className="diary-write-buttons">
        <Button variant="filled" disabled={busy || current} onClick={onUse}>
          使用这张
        </Button>
        <Button disabled={busy} onClick={onBack}>
          返回列表
        </Button>
      </div>
    </div>
  );
}
