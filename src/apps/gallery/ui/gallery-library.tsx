import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import { groupImagesBySavedAt } from "../gallery-groups.ts";
import { useGalleryImages } from "./use-gallery-images.ts";

export function GalleryLibrary({
  active,
  hub,
  onHome,
  onOpenPlayground,
  onOpenImage,
}: {
  active: boolean;
  hub: ImageHub;
  onHome: () => void;
  onOpenPlayground: () => void;
  onOpenImage: (images: readonly ImageRecord[], index: number) => void;
}) {
  const { state, loading, refreshing, refresh } = useGalleryImages(hub, active);
  return (
    <Page
      className="gallery-page"
      navBar={
        <NavBar
          title="图库"
          back={{ label: "主屏幕", onClick: onHome }}
          right={
            <Button disabled={loading || refreshing} onClick={refresh}>
              刷新
            </Button>
          }
        />
      }
    >
      {state.status === "loading" ? (
        <GallerySkeleton />
      ) : state.status === "error" ? (
        <GalleryError message={state.message} onRetry={refresh} />
      ) : (
        <GalleryContent
          images={state.images}
          error={state.error}
          refreshing={state.refreshing}
          onRefresh={refresh}
          onOpenPlayground={onOpenPlayground}
          onOpenImage={onOpenImage}
        />
      )}
    </Page>
  );
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

function GalleryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="gallery-error" role="alert">
      <p>{message}</p>
      <Button variant="filled" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

function GalleryContent({
  images,
  error,
  refreshing,
  onRefresh,
  onOpenPlayground,
  onOpenImage,
}: {
  images: readonly ImageRecord[];
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenPlayground: () => void;
  onOpenImage: (images: readonly ImageRecord[], index: number) => void;
}) {
  const groups = groupImagesBySavedAt(images, new Date());
  return (
    <>
      {error !== null ? (
        <div className="gallery-notice" role="alert">
          <p>{error}</p>
          <Button onClick={onRefresh}>重试</Button>
        </div>
      ) : null}
      {refreshing ? (
        <p className="gallery-refreshing" role="status">
          正在刷新…
        </p>
      ) : null}
      {images.length === 0 ? (
        <div className="gallery-empty">
          <p className="image-message" role="status">
            图库还没有图片。去图乐园生成第一张吧。
          </p>
          <Button variant="filled" onClick={onOpenPlayground}>
            去图乐园
          </Button>
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className="gallery-group"
            aria-labelledby={`gallery-group-${group.key}`}
          >
            <h2 id={`gallery-group-${group.key}`} className="gallery-group-title">
              {group.title}
            </h2>
            <ImageGrid
              images={group.images}
              empty=""
              onOpen={(image) =>
                onOpenImage(
                  images,
                  images.findIndex((candidate) => candidate.id === image.id),
                )
              }
            />
          </section>
        ))
      )}
    </>
  );
}
