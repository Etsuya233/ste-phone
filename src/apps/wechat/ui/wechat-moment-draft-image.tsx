import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentImage } from "../wechat-moments.ts";

export function MomentDraftImage({
  item,
  index,
  count,
  disabled,
  onChoose,
  onRefine,
  onGenerate,
  onRemove,
  onMove,
  onChange,
}: {
  item: MomentImage;
  index: number;
  count: number;
  disabled: boolean;
  onChoose(): void;
  onRefine(): void;
  onGenerate(): void;
  onRemove(): void;
  onMove(direction: number): void;
  onChange(item: MomentImage): void;
}) {
  return (
    <div className="wechat-moment-image-editor">
      <div className="wechat-moment-image-heading">
        <span>
          图片 {index + 1}/{count}
        </span>
        <Button disabled={disabled} onClick={onRemove}>
          删除
        </Button>
      </div>
      {item.image ? (
        <img
          className="wechat-moment-draft-photo"
          src={item.image.imagePath}
          alt={item.description}
        />
      ) : null}
      <label className="wechat-moment-label">
        描述
        <textarea
          rows={3}
          value={item.description}
          disabled={disabled}
          onChange={(event) => onChange({ ...item, description: event.target.value })}
        />
      </label>
      <label className="wechat-moment-label">
        绘图提示词
        <textarea
          rows={6}
          value={item.prompt ?? ""}
          disabled={disabled}
          placeholder="人物、场景、构图、光线与画面风格…"
          onChange={(event) =>
            onChange({
              ...item,
              prompt: event.target.value.trim() ? event.target.value : undefined,
            })
          }
        />
      </label>
      <div className="wechat-moment-image-tools">
        <Button disabled={disabled} onClick={onRefine}>
          AI 完善提示词
        </Button>
        <Button disabled={disabled || !item.prompt?.trim()} onClick={onGenerate}>
          {item.image ? "重新生成图片" : "生成图片"}
        </Button>
        <Button disabled={disabled} onClick={onChoose}>
          {item.image ? "更换图片" : "从图库选图"}
        </Button>
      </div>
      <div className="wechat-moment-image-actions">
        <Button
          aria-label={`上移图片 ${index + 1}`}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </Button>
        <Button
          aria-label={`下移图片 ${index + 1}`}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </Button>
      </div>
    </div>
  );
}
