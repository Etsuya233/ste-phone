import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentMedia } from "../wechat-moments.ts";

export function MomentMediaEditor({
  media,
  onChange,
  disabled,
}: {
  media: MomentMedia;
  onChange(media: MomentMedia): void;
  disabled: boolean;
}) {
  if (media.type === "none") {
    return null;
  }
  if (media.type === "video") {
    return (
      <label className="wechat-moment-label">
        视频描述
        <textarea
          rows={5}
          value={media.description}
          disabled={disabled}
          onChange={(event) => onChange({ type: "video", description: event.target.value })}
        />
      </label>
    );
  }
  const descriptions = media.descriptions;
  function move(index: number, direction: number) {
    const next = [...descriptions];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    onChange({ type: "images", descriptions: next });
  }
  function remove(index: number) {
    onChange({
      type: "images",
      descriptions: descriptions.filter((_, position) => position !== index),
    });
  }
  return (
    <div className="wechat-moment-images-editor">
      {descriptions.map((description, index) => (
        <div className="wechat-moment-image-editor" key={index}>
          <div className="wechat-moment-image-heading">
            <span>
              图片 {index + 1}/{descriptions.length}
            </span>
            <Button disabled={disabled} onClick={() => remove(index)}>
              删除
            </Button>
          </div>
          <label className="wechat-moment-label">
            描述
            <textarea
              rows={3}
              value={description}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  type: "images",
                  descriptions: descriptions.map((item, position) =>
                    position === index ? event.target.value : item,
                  ),
                })
              }
            />
          </label>
          <div className="wechat-moment-image-actions">
            <Button
              aria-label={`上移图片 ${index + 1}`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              aria-label={`下移图片 ${index + 1}`}
              disabled={disabled || index === descriptions.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
          </div>
        </div>
      ))}
      <Button
        className="wechat-moment-add-image"
        disabled={disabled || descriptions.length >= 9}
        onClick={() => onChange({ type: "images", descriptions: [...descriptions, ""] })}
      >
        添加图片描述
      </Button>
    </div>
  );
}
