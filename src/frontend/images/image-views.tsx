import { useState } from "react";
import type { ImageRecord } from "../../core/image-hub/public.ts";
import { galleryImageKey, gallerySourceLabels } from "../../apps/gallery/public.ts";
import type { GalleryImage } from "../../apps/gallery/public.ts";
import { useGallery } from "./gallery-context.ts";
import { NavBar } from "../foundation/nav-bar.tsx";
import { Page } from "../foundation/page.tsx";

/** 缩略图读取失败时显示占位，不把浏览器裂图带进列表。 */
function ImageTile({
  image,
  selected,
  onOpen,
}: {
  image: GalleryImage;
  selected: boolean;
  onOpen: (image: GalleryImage) => void;
}) {
  const [failed, setFailed] = useState(false);
  const { imageUrl } = useGallery();
  const description = image.description || gallerySourceLabels[image.source];
  const label = description.length > 40 ? `${description.slice(0, 40)}…` : description;
  return (
    <button
      type="button"
      onClick={() => onOpen(image)}
      aria-label={`查看图片：${label}${selected ? "（当前配图）" : ""}`}
    >
      {failed ? (
        <span className="image-tile-missing">图片不可用</span>
      ) : (
        <img
          src={imageUrl(image.imagePath)}
          alt={label}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {selected ? <span className="image-tile-current">当前</span> : null}
    </button>
  );
}

export function ImageGrid({
  images,
  onOpen,
  empty,
  selectedKey,
}: {
  images: readonly GalleryImage[];
  onOpen: (image: GalleryImage) => void;
  empty: string;
  selectedKey?: string;
}) {
  if (images.length === 0) {
    return (
      <p className="image-message" role="status">
        {empty}
      </p>
    );
  }
  return (
    <ul className="image-grid" aria-label="图片列表">
      {images.map((image) => (
        <li key={galleryImageKey(image)}>
          <ImageTile
            image={image}
            selected={galleryImageKey(image) === selectedKey}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  );
}

export function ImageDetail({
  image,
  backLabel,
  onBack,
}: {
  image: ImageRecord;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <Page
      className="image-page"
      navBar={<NavBar title="图片" back={{ label: backLabel, onClick: onBack }} />}
    >
      <figure className="image-detail">
        <img src={image.imagePath} alt={image.prompt} />
        <figcaption>{image.prompt}</figcaption>
      </figure>
      <p className="image-message">{new Date(image.savedAt).toLocaleString()}</p>
    </Page>
  );
}
