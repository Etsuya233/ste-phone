import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentMedia } from "../wechat-moments.ts";

export function MomentMediaEditor({
  media,
  disabled,
  onEdit,
  onAdd,
  onVideoChange,
}: {
  media: MomentMedia;
  disabled: boolean;
  onEdit(index: number): void;
  onAdd(): void;
  onVideoChange(description: string): void;
}) {
  if (media.type === "none") {
    return null;
  }
  if (media.type === "video") {
    return (
      <label className="wechat-moment-label">
        视频描述
        <textarea
          rows={4}
          value={media.description}
          disabled={disabled}
          placeholder="画面里发生了什么…"
          onChange={(event) => onVideoChange(event.target.value)}
        />
      </label>
    );
  }
  return (
    <div className="wechat-moment-media-editor">
      <div className="wechat-moment-media-heading">
        <span>图片</span>
        <span>{media.items.length}/9</span>
      </div>
      <div className="wechat-moment-media-grid">
        {media.items.map((item, index) => {
          const missing = !item.description.trim();
          return (
            <button
              type="button"
              key={index}
              className={`wechat-moment-media-tile ${missing ? "wechat-moment-media-tile--missing" : ""}`}
              disabled={disabled}
              aria-label={`编辑图片 ${index + 1}${missing ? "，待填写描述" : ""}`}
              onClick={() => onEdit(index)}
            >
              {item.image ? (
                <img className="wechat-moment-media-tile-photo" src={item.image.imagePath} alt="" />
              ) : (
                <span className="wechat-moment-media-tile-text">
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
        {media.items.length < 9 ? (
          <Button className="wechat-moment-media-add" disabled={disabled} onClick={onAdd}>
            添加图片
          </Button>
        ) : null}
      </div>
      <p className="wechat-moment-media-hint">点按图片可编辑描述和绘图提示词。</p>
    </div>
  );
}
