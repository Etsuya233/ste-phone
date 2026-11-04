import { useState } from "react";
import type { ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { RecentsState } from "./use-playground.ts";

function RecentsThumb({
  image,
  onOpen,
}: {
  image: ImageRecord;
  onOpen: (image: ImageRecord) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <li>
      <button
        type="button"
        className="playground-recents-button"
        onClick={() => onOpen(image)}
        aria-label={`查看图片：${image.prompt}`}
      >
        {failed ? (
          <span className="playground-recents-missing">图片不可用</span>
        ) : (
          <img
            src={image.imagePath}
            alt={image.prompt}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
      </button>
    </li>
  );
}

export function PlaygroundRecents({
  recents,
  onOpen,
  onOpenGallery,
  onRetry,
}: {
  recents: RecentsState;
  onOpen: (image: ImageRecord) => void;
  onOpenGallery: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="playground-recents" aria-labelledby="playground-recents-title">
      <header className="playground-recents-head">
        <h2 id="playground-recents-title">最近作品</h2>
        <Button onClick={onOpenGallery}>在图库查看</Button>
      </header>
      {recents.status === "loading" ? (
        <p className="playground-recents-message" role="status">
          正在读取最近作品…
        </p>
      ) : null}
      {recents.status === "error" ? (
        <div className="playground-recents-error" role="alert">
          <span>{recents.message}</span>
          <Button onClick={onRetry}>重试</Button>
        </div>
      ) : null}
      {recents.status === "ready" ? (
        recents.images.length > 0 ? (
          <ul className="playground-recents-strip" aria-label="最近作品">
            {recents.images.map((image) => (
              <RecentsThumb key={image.id} image={image} onOpen={onOpen} />
            ))}
          </ul>
        ) : (
          <p className="playground-recents-empty">还没有作品，画一张试试。</p>
        )
      ) : null}
    </section>
  );
}
