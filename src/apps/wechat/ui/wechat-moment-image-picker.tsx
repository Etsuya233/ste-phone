import { useEffect, useRef, useState } from "react";
import { galleryImageKey, gallerySourceLabels } from "../../gallery/public.ts";
import type { GalleryImage } from "../../gallery/public.ts";
import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { useGalleryImages } from "../../../frontend/images/use-gallery-images.ts";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";

type PickerProps = Pick<WechatPageProps, "navigation"> & {
  selectedKey?: string;
  onSelect(image: GalleryImage): Promise<void>;
  active: boolean;
};

/** 读取与保存归当前页面所有；卸载丢弃迟到响应，后台保存完成不自动导航。 */
function useImagePicker({ navigation, onSelect, active }: PickerProps) {
  const [preview, setPreview] = useState<GalleryImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (saved && active) {
      navigation.pop();
    }
  }, [saved, active, navigation]);
  async function choose(image: GalleryImage) {
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
  return { preview, setPreview, saving, saved, error, choose };
}

export function WechatMomentImagePicker(props: PickerProps) {
  const { navigation, selectedKey, active } = props;
  const gallery = useGallery();
  const { images, loading, errors, ready, refresh } = useGalleryImages(gallery, active);
  const { preview, setPreview, saving, saved, error, choose } = useImagePicker(props);
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
              <Button disabled={loading} onClick={() => void refresh()}>
                刷新
              </Button>
            ) : undefined
          }
        />
      }
    >
      {errors.map(({ source, message }) => (
        <p key={source} className="wechat-notice" role="alert">
          {gallerySourceLabels[source]}：{message}
        </p>
      ))}
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
          <img
            className="wechat-moment-full-photo"
            src={gallery.imageUrl(preview.imagePath)}
            alt={preview.description ?? gallerySourceLabels[preview.source]}
          />
          {preview.description ? <p>{preview.description}</p> : null}
          <Button
            variant="filled"
            className="wechat-moment-primary"
            disabled={saving || saved || galleryImageKey(preview) === selectedKey}
            onClick={() => void choose(preview)}
          >
            {saving ? "保存中" : galleryImageKey(preview) === selectedKey ? "当前图片" : "使用这张"}
          </Button>
        </div>
      ) : (
        <div inert={saving || saved}>
          {ready && (images.length > 0 || errors.length === 0) ? (
            <ImageGrid
              images={images}
              selectedKey={selectedKey}
              onOpen={setPreview}
              empty="图库还没有图片。"
            />
          ) : null}
        </div>
      )}
    </Page>
  );
}
