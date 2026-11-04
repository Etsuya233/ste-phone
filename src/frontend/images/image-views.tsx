import type { ImageRecord } from "../../core/image-hub/public.ts";
import { NavBar } from "../foundation/nav-bar.tsx";
import { Page } from "../foundation/page.tsx";

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
          <button
            type="button"
            onClick={() => onOpen(image)}
            aria-label={`查看图片：${image.prompt}`}
          >
            <img src={image.imagePath} alt={image.prompt} loading="lazy" />
          </button>
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
