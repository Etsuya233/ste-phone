import { Button } from "../../../frontend/foundation/button.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { useGalleryImages } from "../../../frontend/images/use-gallery-images.ts";
import {
  galleryImageKey,
  galleryImageReference,
  gallerySourceLabels,
} from "../../gallery/public.ts";
import type { CampusAccount } from "../campus-domain.ts";

export function CampusAvatarPicker({
  selected,
  onSelect,
  onClose,
  active,
}: {
  selected: CampusAccount["avatar"];
  onSelect: (image: CampusAccount["avatar"]) => void;
  onClose: () => void;
  active: boolean;
}) {
  const { images, errors, ready, loading } = useGalleryImages(useGallery(), active);
  const selectedImage =
    typeof selected === "string"
      ? images.find(({ imagePath }) => imagePath === selected)
      : selected;

  return (
    <section className="campus-avatar-picker" aria-label="选择头像">
      <div className="campus-row campus-avatar-picker-heading">
        <strong>选择头像</strong>
        <Button onClick={onClose}>关闭</Button>
      </div>
      {errors.map(({ source, message }) => (
        <p key={source} role="alert" className="campus-hint">
          {gallerySourceLabels[source]}：{message}
        </p>
      ))}
      {loading ? (
        <p role="status" className="campus-meta">
          正在读取图库…
        </p>
      ) : null}
      {ready && (images.length > 0 || errors.length === 0) ? (
        <ImageGrid
          images={images}
          selectedKey={selectedImage ? galleryImageKey(selectedImage) : undefined}
          empty="图库还没有图片。"
          onOpen={(image) => onSelect(galleryImageReference(image))}
        />
      ) : null}
    </section>
  );
}
