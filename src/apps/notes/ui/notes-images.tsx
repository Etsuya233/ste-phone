import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { useGalleryImages } from "../../../frontend/images/use-gallery-images.ts";
import {
  galleryImageReference,
  gallerySourceLabels,
  type GalleryImage,
  type GalleryImageReference,
  type GalleryPublic,
} from "../../gallery/public.ts";

export function NotesImagePickerPage({
  gallery,
  current,
  onBack,
  onChoose,
}: {
  gallery: GalleryPublic;
  current: boolean;
  onBack: () => void;
  onChoose: (image: GalleryImageReference) => void;
}) {
  const { images, errors, loading, ready, refresh } = useGalleryImages(gallery, current);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  if (selected) {
    return (
      <Page
        className="notes-page notes-image-page"
        navBar={
          <NavBar
            title="预览图片"
            back={{ label: "选图", onClick: () => setSelected(null) }}
            right={<Button onClick={() => onChoose(galleryImageReference(selected))}>插入</Button>}
          />
        }
      >
        <NotesImagePreview
          src={gallery.imageUrl(selected.imagePath)}
          label={selected.description || gallerySourceLabels[selected.source]}
        />
      </Page>
    );
  }
  return (
    <Page
      className="notes-page notes-picker-page"
      navBar={
        <NavBar
          title="插入图片"
          back={{ label: "备忘录", onClick: onBack }}
          right={
            <Button disabled={loading} onClick={() => void refresh()}>
              刷新
            </Button>
          }
        />
      }
    >
      <p className="notes-picker-hint">选择一张图片，插入后会保留在正文光标处。</p>
      {loading && !ready ? (
        <p className="notes-message" role="status">
          正在读取图库…
        </p>
      ) : null}
      {errors.length ? (
        <p className="notes-message notes-notice--error" role="status">
          {errors
            .map(({ source, message }) => `${gallerySourceLabels[source]}：${message}`)
            .join("；")}
        </p>
      ) : null}
      {ready ? <ImageGrid images={images} onOpen={setSelected} empty="图库还没有图片。" /> : null}
    </Page>
  );
}

export function NotesImageViewPage({
  gallery,
  image,
  onBack,
}: {
  gallery: GalleryPublic;
  image: GalleryImageReference;
  onBack: () => void;
}) {
  return (
    <Page
      className="notes-page notes-image-page"
      navBar={<NavBar title="图片" back={{ label: "备忘录", onClick: onBack }} />}
    >
      <NotesImagePreview
        src={gallery.imageUrl(image.imagePath)}
        label={gallerySourceLabels[image.source]}
      />
    </Page>
  );
}

function NotesImagePreview({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="notes-image-preview">
      {failed ? (
        <p className="notes-message" role="status">
          图片不可用
        </p>
      ) : (
        <img src={src} alt={label} onError={() => setFailed(true)} />
      )}
      <figcaption>{label}</figcaption>
    </figure>
  );
}
