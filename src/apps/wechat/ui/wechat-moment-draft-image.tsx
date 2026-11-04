import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentImage } from "../wechat-moments.ts";

/** 单张图片的完整编辑页内容；草稿仍由发布页持有，本组件只提交当前槽位的变更。 */
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
    <div className="wechat-moment-image-page">
      <p className="wechat-moment-image-caption">
        第 {index + 1} 张，共 {count} 张
      </p>
      {item.image ? (
        <img
          className="wechat-moment-draft-photo"
          src={item.image.imagePath}
          alt={item.description}
        />
      ) : (
        <div className="wechat-moment-draft-empty">还没有实图，保存发布后会显示描述占位。</div>
      )}
      <label className="wechat-moment-label">
        描述
        <textarea
          rows={3}
          value={item.description}
          disabled={disabled}
          placeholder="这张图里有什么…"
          onChange={(event) => onChange({ ...item, description: event.target.value })}
        />
      </label>
      <label className="wechat-moment-label">
        绘图提示词
        <textarea
          rows={4}
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
      <div className="wechat-moment-image-footer">
        <Button disabled={disabled || index === 0} onClick={() => onMove(-1)}>
          上移
        </Button>
        <Button disabled={disabled || index === count - 1} onClick={() => onMove(1)}>
          下移
        </Button>
        <Button
          className="wechat-moment-delete"
          variant="danger"
          disabled={disabled}
          onClick={onRemove}
        >
          删除图片
        </Button>
      </div>
    </div>
  );
}
