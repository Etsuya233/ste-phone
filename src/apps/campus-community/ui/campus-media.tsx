import { galleryImageKey } from "../../gallery/public.ts";
import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { useState } from "react";
import type { CampusImage, CampusPost } from "../campus-domain.ts";
import { ImageIcon } from "./campus-icons.tsx";

function MediaTile({
  image,
  index,
  onOpen,
}: {
  image: CampusImage;
  index: number;
  onOpen: (index: number) => void;
}) {
  const { imageUrl } = useGallery();
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className="campus-photo"
      aria-label={`查看第 ${index + 1} 张配图`}
      onClick={() => onOpen(index)}
    >
      {image.image && !failed ? (
        <img
          src={imageUrl(image.image.imagePath)}
          alt={image.description}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="campus-photo-placeholder">
          <ImageIcon />
          <span>{failed ? "图片不可用" : image.description || image.prompt}</span>
        </span>
      )}
    </button>
  );
}

export function CampusMedia({
  post,
  detail,
  onOpen,
}: {
  post: CampusPost;
  detail: boolean;
  onOpen: (index: number) => void;
}) {
  if (!post.images.length) {
    return null;
  }
  const layout = post.images.length === 1 ? "one" : post.images.length === 2 ? "two" : "many";
  return (
    <div
      className={`campus-photos campus-photos--${layout}${detail ? " campus-photos--detail" : ""}`}
    >
      {post.images.map((image, index) => (
        <MediaTile
          key={image.image ? `${index}:${galleryImageKey(image.image)}` : index}
          image={image}
          index={index}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
