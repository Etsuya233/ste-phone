import { useEffect, useRef, useState } from "react";
import type { MomentDraft, MomentMedia } from "../wechat-moments.ts";
import { useMomentDraftImages } from "./use-wechat-moment-draft-images.ts";
import type { WechatPageProps } from "./wechat-page.tsx";

type Confirmation = { type: "discard" } | { type: "media"; media: MomentMedia } | null;

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
        media: { type: "none" },
        author: {
          ...state.data.account!,
          name: state.people.find((person) => person.id === state.data.account!.id)!.name,
        },
      },
  );
  const [status, setStatus] = useState<"editing" | "saving" | "saved">("editing");
  const [error, setError] = useState<string | null>(null);
  const images = useMomentDraftImages({ draft, setDraft, wechat, navigation });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [wechat]);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
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
    if (draft.text || draft.media.type !== "none") {
      setConfirmation({ type: "discard" });
    } else {
      navigation.pop();
    }
  }
  function selectMedia(type: MomentMedia["type"]) {
    if (draft.media.type === type) {
      return;
    }
    const media: MomentMedia =
      type === "images"
        ? { type, items: [{ description: "" }] }
        : type === "video"
          ? { type, description: "" }
          : { type };
    const hasDescription =
      draft.media.type === "images"
        ? draft.media.items.some((item) => item.description.length || item.image || item.prompt)
        : draft.media.type === "video" && !!draft.media.description;
    if (hasDescription) {
      setConfirmation({ type: "media", media });
    } else {
      setDraft({ ...draft, media });
    }
  }
  function confirm() {
    if (confirmation?.type === "discard") {
      images.cancel();
      navigation.pop();
    } else if (confirmation?.type === "media") {
      setDraft({ ...draft, media: confirmation.media });
    }
    setConfirmation(null);
  }

  return {
    draft,
    setDraft,
    imageBusy: images.imageBusy,
    chooseImage: images.chooseImage,
    imageTask: images.imageTask,
    status,
    error,
    imageError: images.imageError,
    confirmation,
    setConfirmation,
    publish,
    back,
    selectMedia,
    confirm,
  };
}
