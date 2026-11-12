import { useGallery } from "../../../frontend/images/gallery-context.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentMedia } from "../wechat-moments.ts";

export function MomentMediaEditor({
  media,
  disabled,
  onEdit,
  onAdd,
}: {
  media: MomentMedia;
  disabled: boolean;
  onEdit(index: number): void;
  onAdd(type: MomentMedia[number]["type"]): void;
}) {
  const { imageUrl } = useGallery();
  return (
    <div className="wechat-moment-media-editor">
      <div className="wechat-moment-media-heading">
        <span>图片和视频</span>
        <span>{media.length}/9</span>
      </div>
      <div className="wechat-moment-media-grid">
        {media.map((item, index) => {
          const missing = !item.description.trim();
          return (
            <button
              type="button"
              key={index}
              className={`wechat-moment-media-tile ${missing ? "wechat-moment-media-tile--missing" : ""}`}
              disabled={disabled}
              aria-label={`编辑${item.type === "image" ? "图片" : "视频"} ${index + 1}${missing ? "，待填写描述" : ""}`}
              onClick={() => onEdit(index)}
            >
              {item.type === "image" && item.image ? (
                <img
                  className="wechat-moment-media-tile-photo"
                  src={imageUrl(item.image.imagePath)}
                  alt=""
                />
              ) : (
                <span className="wechat-moment-media-tile-text">
                  {item.type === "video" ? "视频：" : ""}
                  {item.description || "添加描述"}
                </span>
              )}
              <span className="wechat-moment-media-tile-index" aria-hidden="true">
                {index + 1}
              </span>
              {missing ? (
                <span className="wechat-moment-media-tile-dot" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
      {media.length < 9 ? (
        <div className="wechat-moment-image-tools">
          <Button disabled={disabled} onClick={() => onAdd("image")}>
            添加图片
          </Button>
          <Button disabled={disabled} onClick={() => onAdd("video")}>
            添加视频
          </Button>
        </div>
      ) : null}
      <p className="wechat-moment-media-hint">图片和视频合计最多 9 个，点按可编辑、排序或删除。</p>
    </div>
  );
}
