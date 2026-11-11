import { useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";

export function CampusAvatarPicker({
  hub,
  selected,
  onSelect,
  onClose,
}: {
  hub: ImageHub;
  selected: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<readonly ImageRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = useRef(0);

  useEffect(() => {
    const request = ++read.current;
    setImages(null);
    setError(null);
    void hub
      .listImages()
      .then((records) => {
        if (read.current === request) {
          setImages(records);
        }
      })
      .catch((cause: unknown) => {
        if (read.current === request) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      read.current++;
    };
  }, [hub]);

  return (
    <section className="campus-avatar-picker" aria-label="选择头像">
      <div className="campus-row campus-avatar-picker-heading">
        <strong>选择头像</strong>
        <Button onClick={onClose}>关闭</Button>
      </div>
      {error ? (
        <p role="alert" className="campus-hint">
          {error}
        </p>
      ) : null}
      {images === null && !error ? (
        <p role="status" className="campus-meta">
          正在读取图库…
        </p>
      ) : null}
      {images ? (
        <ImageGrid
          images={images}
          selectedId={images.find(({ imagePath }) => imagePath === selected)?.id}
          empty="图库还没有图片。"
          onOpen={(image) => onSelect(image.imagePath)}
        />
      ) : null}
    </section>
  );
}
