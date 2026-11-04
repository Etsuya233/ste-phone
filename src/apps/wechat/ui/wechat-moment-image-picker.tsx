import { useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";

type PickerProps = Pick<WechatPageProps, "navigation"> & {
  hub: ImageHub;
  selectedId?: string;
  onSelect(image: ImageRecord): Promise<void>;
  active: boolean;
};

/** 读取与保存归当前页面所有；卸载丢弃迟到响应，后台保存完成不自动导航。 */
function useImagePicker({ hub, navigation, onSelect, active }: PickerProps) {
  const [images, setImages] = useState<readonly ImageRecord[]>([]);
  const [preview, setPreview] = useState<ImageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      read.current++;
    };
  }, [hub]);
  useEffect(() => {
    if (saved && active) {
      navigation.pop();
    }
  }, [saved, active, navigation]);
  async function load() {
    const request = ++read.current;
    setLoading(true);
    setError(null);
    try {
      const result = await hub.listImages();
      if (read.current === request) {
        setImages(result);
      }
    } catch (cause) {
      if (read.current === request) {
        setError((cause as Error).message);
      }
    } finally {
      if (read.current === request) {
        setLoading(false);
      }
    }
  }
  async function choose(image: ImageRecord) {
    setSaving(true);
    setError(null);
    try {
      await onSelect(image);
      if (mounted.current) {
        setSaved(true);
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause as Error).message);
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  }
  return { images, preview, setPreview, loading, saving, saved, error, load, choose };
}

export function WechatMomentImagePicker(props: PickerProps) {
  const { navigation, selectedId } = props;
  const { images, preview, setPreview, loading, saving, saved, error, load, choose } =
    useImagePicker(props);
  return (
    <Page
      navBar={
        <NavBar
          title={preview ? "预览图片" : "选择图片"}
          back={{
            label: "返回",
            onClick: () => {
              if (!saving) {
                if (preview) {
                  setPreview(null);
                } else {
                  navigation.pop();
                }
              }
            },
          }}
          right={
            !preview ? (
              <Button disabled={loading} onClick={() => void load()}>
                刷新
              </Button>
            ) : undefined
          }
        />
      }
    >
      {error ? (
        <p className="wechat-notice" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="wechat-notice" role="status">
          正在读取图库…
        </p>
      ) : null}
      {preview ? (
        <div className="wechat-moment-editor">
          <img className="wechat-moment-full-photo" src={preview.imagePath} alt={preview.prompt} />
          <p>{preview.prompt}</p>
          <Button
            variant="filled"
            className="wechat-moment-primary"
            disabled={saving || saved || preview.id === selectedId}
            onClick={() => void choose(preview)}
          >
            {saving ? "保存中" : preview.id === selectedId ? "当前图片" : "使用这张"}
          </Button>
        </div>
      ) : (
        <div inert={saving || saved}>
          <ImageGrid
            images={images}
            selectedId={selectedId}
            onOpen={setPreview}
            empty="图库还没有图片。"
          />
        </div>
      )}
    </Page>
  );
}
