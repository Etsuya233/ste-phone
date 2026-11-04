import { useState } from "react";
import type { ImageRecord } from "../../core/image-hub/public.ts";
import { NavBar } from "../foundation/nav-bar.tsx";
import { Page } from "../foundation/page.tsx";

/** 缩略图读取失败时显示占位，不把浏览器裂图带进列表。 */
function ImageTile({
  image,
  onOpen,
}: {
  image: ImageRecord;
  onOpen: (image: ImageRecord) => void;
}) {
  const [failed, setFailed] = useState(false);
  const label = image.prompt.length > 40 ? `${image.prompt.slice(0, 40)}…` : image.prompt;
  return (
    <button type="button" onClick={() => onOpen(image)} aria-label={`查看图片：${label}`}>
      {failed ? (
        <span className="image-tile-missing">图片不可用</span>
      ) : (
        <img src={image.imagePath} alt={label} loading="lazy" onError={() => setFailed(true)} />
      )}
    </button>
  );
}

export function ImageGrid({
  images,
  onOpen,
  empty,
}: {
  images: readonly ImageRecord[];
  onOpen: (image: ImageRecord) => void;
  empty: string;
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
        <li key={image.id}>
          <ImageTile image={image} onOpen={onOpen} />
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
