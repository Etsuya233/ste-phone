import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { galleryImageKey, gallerySourceLabels } from "../public.ts";
import type { GalleryImage } from "../public.ts";
import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function GalleryViewer({
  images,
  initialIndex,
  active,
  onBack,
}: {
  images: readonly GalleryImage[];
  initialIndex: number;
  active: boolean;
  onBack: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  indexRef.current = index;

  useLayoutEffect(() => {
    const element = track.current;
    if (!element) {
      return;
    }
    element.scrollTo({ left: initialIndex * element.clientWidth, behavior: "auto" });
  }, [initialIndex]);

  useEffect(() => {
    const element = track.current;
    if (!element) {
      return;
    }
    // 机身缩放或窗口调整会改变页宽，保持当前图片对齐且不带动画。
    const observer = new ResizeObserver(() => {
      element.scrollTo({ left: indexRef.current * element.clientWidth, behavior: "auto" });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function goTo(target: number, behavior: ScrollBehavior) {
    const element = track.current;
    if (!element) {
      return;
    }
    element.scrollTo({ left: target * element.clientWidth, behavior });
    indexRef.current = target;
    setIndex(target);
  }

  function handleScroll() {
    const element = track.current;
    if (!element || !element.clientWidth) {
      return;
    }
    const nearest = Math.min(
      images.length - 1,
      Math.max(0, Math.round(element.scrollLeft / element.clientWidth)),
    );
    indexRef.current = nearest;
    setIndex((previous) => (previous === nearest ? previous : nearest));
  }

  useEffect(() => {
    if (!active) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) {
        return;
      }
      const next = Math.min(images.length - 1, Math.max(0, index + step));
      if (next === index) {
        return;
      }
      event.preventDefault();
      goTo(next, reduceMotion() ? "auto" : "smooth");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, images.length, index]);

  return (
    <Page
      className="gallery-viewer-page"
      navBar={
        <NavBar
          title="图片"
          back={{ label: "图库", onClick: onBack }}
          right={
            <span className="gallery-viewer-count" role="status">
              {index + 1} / {images.length}
            </span>
          }
        />
      }
    >
      <div
        ref={track}
        className="gallery-viewer-track"
        role="region"
        aria-label="图片浏览"
        onScroll={handleScroll}
      >
        {images.map((image) => (
          <GallerySlide key={galleryImageKey(image)} image={image} />
        ))}
      </div>
    </Page>
  );
}

function GallerySlide({ image }: { image: GalleryImage }) {
  const { imageUrl } = useGallery();
  return (
    <figure className="gallery-viewer-slide">
      <div className="gallery-viewer-media">
        <img
          src={imageUrl(image.imagePath)}
          alt={image.description ?? gallerySourceLabels[image.source]}
          loading="lazy"
        />
      </div>
      <figcaption className="gallery-viewer-caption">
        {image.description ? <p className="gallery-viewer-prompt">{image.description}</p> : null}
        <p className="gallery-viewer-source">{gallerySourceLabels[image.source]}</p>
        <time className="gallery-viewer-time" dateTime={image.savedAt}>
          {new Date(image.savedAt).toLocaleString("zh-CN")}
        </time>
        {image.description ? <CopyPromptButton prompt={image.description} /> : null}
      </figcaption>
    </figure>
  );
}

function CopyPromptButton({ prompt }: { prompt: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  function show(next: "copied" | "failed") {
    window.clearTimeout(timer.current);
    setResult(next);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      setResult(null);
    }, 1600);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      if (mounted.current) {
        show("copied");
      }
    } catch {
      if (mounted.current) {
        show("failed");
      }
    }
  }

  return (
    <div className="gallery-viewer-copy">
      <Button onClick={() => void copy()}>复制描述</Button>
      {result === "copied" ? (
        <span className="gallery-viewer-copied" role="status">
          已复制
        </span>
      ) : null}
      {result === "failed" ? (
        <span className="gallery-viewer-copy-error" role="alert">
          复制失败，请长按选择描述。
        </span>
      ) : null}
    </div>
  );
}
