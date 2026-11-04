import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { momentImageAt, type MomentDraft, type MomentImage } from "../wechat-moments.ts";
import type { WechatPageProps } from "./wechat-page.tsx";

/** 草稿图像任务拥有固定输入、取消和迟到结果检查；图库选择只修改内存草稿。 */
export function useMomentDraftImages({
  draft,
  setDraft,
  wechat,
  navigation,
}: Pick<WechatPageProps, "wechat" | "navigation"> & {
  draft: MomentDraft;
  setDraft: Dispatch<SetStateAction<MomentDraft>>;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageRunning = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [wechat]);
  function cancel() {
    if (imageRunning.current) {
      wechat.moments.generation.cancel();
    }
  }
  function chooseImage(index: number) {
    const selected = momentImageAt(draft, index);
    const items = draft.media;
    navigation.push({
      page: "moment-image-picker",
      selectedId: selected.image?.id,
      onSelect: async (image) => {
        setDraft({
          ...draft,
          media: items.map((item, position) =>
            position === index
              ? {
                  ...selected,
                  description: selected.description || image.prompt,
                  image: { id: image.id, imagePath: image.imagePath },
                }
              : item,
          ),
        });
      },
    });
  }
  async function imageTask(index: number, kind: "refine" | "generate") {
    // 任务固定整份草稿；等待期间锁定媒体编辑、调序与删除，返回槽位保持同一归属。
    const input = structuredClone(draft);
    const selected = momentImageAt(input, index);
    const items = input.media;
    imageRunning.current = true;
    setImageBusy(true);
    setImageError(null);
    try {
      const item: MomentImage =
        kind === "refine"
          ? {
              ...selected,
              prompt: await wechat.moments.refineDraftImagePrompt(input, index, selected.prompt),
            }
          : await wechat.moments.generateDraftImage(input, index);
      if (mounted.current) {
        setDraft({
          ...input,
          media: items.map((current, position) => (position === index ? item : current)),
        });
      }
    } catch (cause) {
      if (mounted.current && (cause as Error).name !== "AbortError") {
        setImageError((cause as Error).message);
      }
    } finally {
      imageRunning.current = false;
      if (mounted.current) {
        setImageBusy(false);
      }
    }
  }
  return { imageBusy, imageError, chooseImage, imageTask, cancel };
}
