import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { useState } from "react";
import type { DiaryEntry } from "../diary.ts";

type DiaryPhotoSource = NonNullable<DiaryEntry["image"]>;

/** 相纸样式与读取失败占位集中在此；大图页用 large 展示完整描述。 */
export function DiaryPhoto({
  image,
  prompt,
  large = false,
  onOpen,
}: {
  image: DiaryPhotoSource;
  prompt?: string;
  large?: boolean;
  onOpen?: () => void;
}) {
  const { imageUrl } = useGallery();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const failed = failedPath === image.imagePath;
  const picture = failed ? (
    <span className="diary-photo-missing">
      <span className="diary-photo-missing-title">配图不可用</span>
      <span className="diary-photo-missing-note">这张图片暂时读不出来，可以更换一张。</span>
    </span>
  ) : (
    <img
      src={imageUrl(image.imagePath)}
      alt={prompt ?? "日记配图"}
      loading={large ? "eager" : "lazy"}
      onError={() => setFailedPath(image.imagePath)}
    />
  );
  return (
    <figure className={`diary-photo${large ? " diary-photo--large" : ""}`}>
      {onOpen ? (
        <button type="button" className="diary-photo-open" aria-label="查看大图" onClick={onOpen}>
          {picture}
        </button>
      ) : (
        <div className="diary-photo-open">{picture}</div>
      )}
      {prompt ? <figcaption className="diary-photo-caption">{prompt}</figcaption> : null}
    </figure>
  );
}
