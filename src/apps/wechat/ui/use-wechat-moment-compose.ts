import { useEffect, useRef, useState } from "react";
import type { MomentDraft, MomentMedia } from "../wechat-moments.ts";
import { useMomentDraftImages } from "./use-wechat-moment-draft-images.ts";
import type { WechatPageProps } from "./wechat-page.tsx";

export type MomentComposeProps = WechatPageProps & {
  scopeId: string;
  active: boolean;
  onPublished(): void;
  initialDraft?: MomentDraft;
};

export function useMomentCompose({
  wechat,
  navigation,
  active,
  onPublished,
  state,
  initialDraft,
}: MomentComposeProps) {
  const [draft, setDraft] = useState<MomentDraft>(
    () =>
      initialDraft ?? {
        text: "",
        media: [],
        author: {
          ...state.data.account!,
          name: state.people.find((person) => person.id === state.data.account!.id)!.name,
        },
      },
  );
  const [status, setStatus] = useState<"editing" | "saving" | "saved">("editing");
  const [error, setError] = useState<string | null>(null);
  const [editingMedia, setEditingMedia] = useState<number | null>(null);
  const images = useMomentDraftImages({ draft, setDraft, wechat, navigation });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [wechat]);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    // 保存完成后仅在本页回到前台时返回；Home 和关闭手机不触发后台导航。
    if (active && status === "saved") {
      onPublished();
      navigation.pop();
    }
  }, [active, status, navigation, onPublished]);
  async function publish() {
    setStatus("saving");
    setError(null);
    try {
      await wechat.moments.publish(draft, draft.author);
      if (mounted.current) {
        setStatus("saved");
      }
    } catch (error) {
      if (mounted.current) {
        setStatus("editing");
        setError((error as Error).message);
      }
    }
  }
  function back() {
    if (status !== "editing") {
      return;
    }
    // 空图片槽或空视频描述没有需要保留的内容，不弹舍弃确认。
    const hasContent =
      !!draft.text.trim() ||
      draft.media.some(
        (item) => item.description.trim() || (item.type === "image" && (item.image || item.prompt)),
      );
    if (hasContent) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }
  function discardDraft() {
    images.cancel();
    navigation.pop();
    setDiscard(false);
  }
  function openMedia(index: number) {
    setEditingMedia(index);
  }
  function closeMedia() {
    setEditingMedia(null);
  }
  function addMedia(type: MomentMedia[number]["type"]) {
    if (draft.media.length >= 9) {
      throw new Error("图片和视频合计最多 9 个");
    }
    setEditingMedia(draft.media.length);
    setDraft({ ...draft, media: [...draft.media, { type, description: "" }] });
  }
  function updateMedia(index: number, item: MomentMedia[number]) {
    setDraft({
      ...draft,
      media: draft.media.map((current, position) => (position === index ? item : current)),
    });
  }
  function removeMedia(index: number) {
    setDraft({ ...draft, media: draft.media.filter((_, position) => position !== index) });
    setEditingMedia(null);
  }
  function moveMedia(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= draft.media.length) {
      throw new Error("朋友圈媒体位置无效");
    }
    const media = [...draft.media];
    [media[index], media[target]] = [media[target]!, media[index]!];
    setDraft({ ...draft, media });
    setEditingMedia(target);
  }

  return {
    draft,
    setDraft,
    imageBusy: images.imageBusy,
    chooseImage: images.chooseImage,
    imageTask: images.imageTask,
    editingMedia,
    openMedia,
    closeMedia,
    addMedia,
    updateMedia,
    removeMedia,
    moveMedia,
    status,
    error,
    imageError: images.imageError,
    discard,
    setDiscard,
    publish,
    back,
    discardDraft,
  };
}
