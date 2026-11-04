import type { useMomentCompose } from "./use-wechat-moment-compose.ts";
import { MomentDraftImage } from "./wechat-moment-draft-image.tsx";

/** 发布页中的图片二级页；编辑结果实时写回同一份草稿，返回不会丢失。 */
export function MomentComposeImage({
  editor,
  index,
}: {
  editor: ReturnType<typeof useMomentCompose>;
  index: number;
}) {
  const media = editor.draft.media;
  const item = media.type === "images" ? media.items[index] : undefined;
  if (media.type !== "images" || !item) {
    return null;
  }
  return (
    <div className="wechat-moment-editor">
      {editor.imageError ? (
        <p className="wechat-notice" role="alert">
          {editor.imageError}
        </p>
      ) : null}
      <MomentDraftImage
        item={item}
        index={index}
        count={media.items.length}
        disabled={editor.imageBusy}
        onChoose={() => editor.chooseImage(index)}
        onRefine={() => void editor.imageTask(index, "refine")}
        onGenerate={() => void editor.imageTask(index, "generate")}
        onRemove={() => editor.removeImage(index)}
        onMove={(direction) => editor.moveImage(index, direction)}
        onChange={(next) => editor.updateImage(index, next)}
      />
    </div>
  );
}
