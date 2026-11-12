import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GalleryBrowseResult,
  GalleryFilter,
  GalleryPublic,
} from "../../apps/gallery/public.ts";

export function useGalleryImages(
  gallery: GalleryPublic,
  active: boolean,
  filter: GalleryFilter = "all",
) {
  const [result, setResult] = useState<(GalleryBrowseResult & { filter: GalleryFilter }) | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const readSequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++readSequence.current;
    setLoading(true);
    const next = await gallery.browse(filter);
    if (readSequence.current === id) {
      setResult((previous) => {
        // 只保留本次请求失败来源的上一份照片；成功返回空列表表示该来源已经清空。
        const stale =
          previous?.images.filter((image) =>
            next.errors.some(({ source }) => source === image.source),
          ) ?? [];
        const images = stale.length
          ? [...next.images, ...stale].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
          : next.images;
        return { ...next, images, filter };
      });
      setLoading(false);
    }
  }, [gallery, filter]);

  useEffect(() => {
    if (active) {
      void refresh();
    }
    return () => {
      readSequence.current++;
    };
  }, [active, refresh]);

  const current = result?.filter === filter ? result : null;
  return {
    images: current?.images ?? [],
    errors: current?.errors ?? [],
    loading,
    ready: current !== null,
    refresh,
  };
}
