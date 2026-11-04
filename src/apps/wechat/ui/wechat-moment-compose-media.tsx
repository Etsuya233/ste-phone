import { Button } from "../../../frontend/foundation/button.tsx";
import type { useMomentCompose } from "./use-wechat-moment-compose.ts";
import { MomentDraftImage } from "./wechat-moment-draft-image.tsx";

/** 媒体二级页直接编辑同一份草稿，位置按图片与视频混排后的顺序计算。 */
export function MomentComposeMedia({
  editor,
  index,
}: {
  editor: ReturnType<typeof useMomentCompose>;
  index: number;
}) {
  const item = editor.draft.media[index]!;
  const count = editor.draft.media.length;
  return (
    <div className="wechat-moment-editor">
      {editor.imageError ? (
        <p className="wechat-notice" role="alert">
          {editor.imageError}
        </p>
      ) : null}
      {item.type === "image" ? (
        <MomentDraftImage
          item={item}
          index={index}
          count={count}
          disabled={editor.imageBusy}
          onChoose={() => editor.chooseImage(index)}
          onRefine={() => void editor.imageTask(index, "refine")}
          onGenerate={() => void editor.imageTask(index, "generate")}
          onRemove={() => editor.removeMedia(index)}
          onMove={(direction) => editor.moveMedia(index, direction)}
          onChange={(next) => editor.updateMedia(index, next)}
        />
      ) : (
        <>
          <label className="wechat-moment-label">
            视频描述
            <textarea
              rows={4}
              value={item.description}
              disabled={editor.imageBusy}
              placeholder="画面里发生了什么…"
              onChange={(event) =>
                editor.updateMedia(index, { ...item, description: event.target.value })
              }
            />
          </label>
          <div className="wechat-moment-image-footer">
            <Button
              disabled={editor.imageBusy || index === 0}
              onClick={() => editor.moveMedia(index, -1)}
            >
              上移
            </Button>
            <Button
              disabled={editor.imageBusy || index === count - 1}
              onClick={() => editor.moveMedia(index, 1)}
            >
              下移
            </Button>
            <Button
              variant="danger"
              disabled={editor.imageBusy}
              onClick={() => editor.removeMedia(index)}
            >
              删除视频
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
