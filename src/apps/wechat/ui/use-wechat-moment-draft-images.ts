import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MomentDraft, MomentImage } from "../wechat-moments.ts";
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
    if (draft.media.type !== "images") {
      throw new Error("当前草稿没有图片");
    }
    const items = draft.media.items;
    navigation.push({
      page: "moment-image-picker",
      selectedId: items[index]!.image?.id,
      onSelect: async (image) => {
        setDraft({
          ...draft,
          media: {
            type: "images",
            items: items.map((item, position) =>
              position === index
                ? {
                    ...item,
                    description: item.description || image.prompt,
                    image: { id: image.id, imagePath: image.imagePath },
                  }
                : item,
            ),
          },
        });
      },
    });
  }
  async function imageTask(index: number, kind: "refine" | "generate") {
    // 任务固定整份草稿；等待期间锁定媒体编辑、调序与删除，返回槽位保持同一归属。
    const input = structuredClone(draft);
    if (input.media.type !== "images") {
      throw new Error("当前草稿没有图片");
    }
    const items = input.media.items;
    imageRunning.current = true;
    setImageBusy(true);
    setImageError(null);
    try {
      const item: MomentImage =
        kind === "refine"
          ? {
              ...items[index]!,
              prompt: await wechat.moments.refineDraftImagePrompt(
                input,
                index,
                items[index]!.prompt,
              ),
            }
          : await wechat.moments.generateDraftImage(input, index);
      if (mounted.current) {
        setDraft({
          ...input,
          media: {
            type: "images",
            items: items.map((current, position) => (position === index ? item : current)),
          },
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
