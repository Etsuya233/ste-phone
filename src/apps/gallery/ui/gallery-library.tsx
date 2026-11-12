import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar, NavBarActionGroup } from "../../../frontend/foundation/nav-bar.tsx";
import { Icon } from "../../../frontend/foundation/icon.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { groupImagesBySavedAt } from "../gallery-groups.ts";
import type { GalleryService } from "../gallery-service.ts";
import { galleryImageKey, gallerySourceLabels } from "../public.ts";
import type { GalleryFilter, GalleryImage } from "../public.ts";
import { photoAccept } from "../photo-storage.ts";
import { GalleryUploadAlert } from "./gallery-upload-alert.tsx";
import { useGalleryImages } from "../../../frontend/images/use-gallery-images.ts";

const filters = [
  { value: "all", label: "全部" },
  { value: "phone", label: gallerySourceLabels.phone },
  { value: "hub", label: gallerySourceLabels.hub },
] as const;

export function GalleryLibrary({
  active,
  gallery,
  onHome,
  onOpenPlayground,
  onOpenImage,
}: {
  active: boolean;
  gallery: GalleryService;
  onHome: () => void;
  onOpenPlayground: () => void;
  onOpenImage: (images: readonly GalleryImage[], index: number) => void;
}) {
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const { images, errors, ready, loading, refresh } = useGalleryImages(gallery, active, filter);
  const upload = useSyncExternalStore(gallery.subscribeUpload, gallery.getUploadState);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active && filter !== "hub") {
      return gallery.subscribePhotos(() => void refresh());
    }
  }, [active, filter, gallery, refresh]);

  return (
    <>
      <Page
        className="gallery-page"
        inert={upload.status !== "idle"}
        navBar={
          <NavBar
            title="图库"
            back={{ label: "主屏幕", onClick: onHome }}
            right={
              <NavBarActionGroup label="图库操作">
                <Button
                  aria-label="刷新图库"
                  title="刷新图库"
                  disabled={loading}
                  onClick={() => void refresh()}
                >
                  <Icon>
                    <svg viewBox="0 0 24 24">
                      <path d="M20 7v5h-5M19.4 12a7.5 7.5 0 1 0-1.9 5.2" />
                    </svg>
                  </Icon>
                </Button>
                <Button
                  aria-label="上传到手机图库"
                  title="上传到手机图库"
                  onClick={() => input.current!.click()}
                >
                  <Icon>
                    <svg viewBox="0 0 24 24">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </Icon>
                </Button>
              </NavBarActionGroup>
            }
          />
        }
      >
        <input
          ref={input}
          type="file"
          accept={photoAccept}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files!);
            event.currentTarget.value = "";
            if (files.length > 0) {
              setFilter("phone");
              void gallery.startUpload(files);
            }
          }}
        />
        <div className="gallery-filters">
          <SegmentedControl
            label="图片来源"
            value={filter}
            onValueChange={setFilter}
            options={filters}
          />
        </div>
        {errors.map(({ source, message }) => (
          <p key={source} className="gallery-notice" role="alert">
            {gallerySourceLabels[source]}：{message}
          </p>
        ))}
        {loading && ready ? (
          <p className="gallery-refreshing" role="status">
            正在刷新…
          </p>
        ) : null}
        {loading && !ready ? <GallerySkeleton /> : null}
        {!loading && images.length === 0 && errors.length === 0 ? (
          <div className="gallery-empty">
            <p className="image-message" role="status">
              图库还没有图片。
            </p>
            {filter !== "hub" ? (
              <Button variant="filled" onClick={() => input.current!.click()}>
                上传照片
              </Button>
            ) : null}
            {filter !== "phone" ? <Button onClick={onOpenPlayground}>去图乐园</Button> : null}
          </div>
        ) : null}
        <GalleryGroups images={images} onOpenImage={onOpenImage} />
      </Page>
      {upload.status === "idle" ? null : (
        <GalleryUploadAlert gallery={gallery} state={upload} active={active} />
      )}
    </>
  );
}

function GalleryGroups({
  images,
  onOpenImage,
}: {
  images: readonly GalleryImage[];
  onOpenImage: (images: readonly GalleryImage[], index: number) => void;
}) {
  return groupImagesBySavedAt(images, new Date()).map(({ key, title, images: groupImages }) => (
    <section key={key} className="gallery-group" aria-labelledby={`gallery-group-${key}`}>
      <h2 id={`gallery-group-${key}`} className="gallery-group-title">
        {title}
      </h2>
      <ImageGrid
        images={groupImages}
        empty=""
        onOpen={(image) =>
          onOpenImage(
            images,
            images.findIndex((candidate) => galleryImageKey(candidate) === galleryImageKey(image)),
          )
        }
      />
    </section>
  ));
}

function GallerySkeleton() {
  return (
    <>
      <p className="gallery-sr-only" role="status">
        正在读取图片…
      </p>
      <div className="gallery-skeleton" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </>
  );
}
