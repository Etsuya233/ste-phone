import { Button } from "../../../frontend/foundation/button.tsx";
import { MomentDraftImage } from "./wechat-moment-draft-image.tsx";
import type { MomentMedia } from "../wechat-moments.ts";

export function MomentMediaEditor({
  media,
  onChange,
  disabled,
  onChoose,
  onRefine,
  onGenerate,
}: {
  media: MomentMedia;
  onChange(media: MomentMedia): void;
  disabled: boolean;
  onChoose(index: number): void;
  onRefine(index: number): void;
  onGenerate(index: number): void;
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
  const items = media.items;
  function move(index: number, direction: number) {
    const next = [...items];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    onChange({ type: "images", items: next });
  }
  function remove(index: number) {
    onChange({
      type: "images",
      items: items.filter((_, position) => position !== index),
    });
  }
  return (
    <div className="wechat-moment-images-editor">
      {items.map((item, index) => (
        <MomentDraftImage
          key={index}
          item={item}
          index={index}
          count={items.length}
          disabled={disabled}
          onChoose={() => onChoose(index)}
          onRefine={() => onRefine(index)}
          onGenerate={() => onGenerate(index)}
          onRemove={() => remove(index)}
          onMove={(direction) => move(index, direction)}
          onChange={(next) =>
            onChange({
              type: "images",
              items: items.map((current, position) => (position === index ? next : current)),
            })
          }
        />
      ))}
      <Button
        className="wechat-moment-add-image"
        disabled={disabled || items.length >= 9}
        onClick={() => onChange({ type: "images", items: [...items, { description: "" }] })}
      >
        添加图片
      </Button>
    </div>
  );
}
