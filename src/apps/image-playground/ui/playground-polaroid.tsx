import { useState } from "react";
import type { ImageRecord } from "../../../core/image-hub/public.ts";

/** 相纸卡片；图片读取失败时保留纸面，不把浏览器裂图带进画布。 */
export function PlaygroundPolaroid({
  image,
  onOpen,
}: {
  image: ImageRecord;
  onOpen: (image: ImageRecord) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="playground-polaroid">
      <button
        type="button"
        className="playground-polaroid-button"
        onClick={() => onOpen(image)}
        aria-label={`查看图片：${image.prompt}`}
      >
        {failed ? (
          <span className="playground-polaroid-missing">图片不可用</span>
        ) : (
          <img
            src={image.imagePath}
            alt={image.prompt}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
      </button>
      <figcaption>{image.prompt}</figcaption>
    </figure>
  );
}
