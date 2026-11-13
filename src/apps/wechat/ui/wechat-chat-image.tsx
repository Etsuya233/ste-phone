import { useEffect, useState } from "react";
import { galleryImageKey, galleryImageReference } from "../../gallery/public.ts";
import type { GalleryImageReference } from "../../gallery/public.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { useGallery } from "../../../frontend/images/gallery-context.ts";
import type { WechatPageProps } from "./wechat-page.tsx";
import { canWriteWechatChat, wechatChatWriteBusy } from "./wechat-chat-writing.ts";
import { WechatImageIcon } from "./wechat-chat-icons.tsx";

type ImagePageProps = WechatPageProps & { id: string; messageId?: string; active: boolean };

function useChatImage({
  wechat,
  state,
  id,
  messageId,
  active,
  navigation,
  sendMode,
}: ImagePageProps) {
  const message = wechat.getConversation(id)?.messages.find((item) => item.id === messageId);
  const original = message?.content.type === "image" && !message.recalled ? message.content : null;
  const [description, setDescription] = useState(original?.description ?? "");
  const [prompt, setPrompt] = useState(original?.prompt ?? "");
  const [image, setImage] = useState<GalleryImageReference | undefined>(original?.image);
  const [action, setAction] = useState<"refine" | "generate" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const changed =
    description !== (original?.description ?? "") ||
    prompt !== (original?.prompt ?? "") ||
    image !== original?.image;
  const unavailable = !!messageId && !original;
  const locked =
    unavailable ||
    !canWriteWechatChat(state, id) ||
    wechatChatWriteBusy(state) ||
    !!action ||
    saved;
  useEffect(() => {
    if (saved && active) {
      navigation.pop();
    }
  }, [saved, active, navigation]);

  async function run(next: NonNullable<typeof action>) {
    setAction(next);
    setError("");
    try {
      if (next === "refine") {
        setPrompt(await wechat.media.refineImagePrompt(id, description, prompt));
      } else if (next === "generate") {
        setImage(await wechat.media.generateChatImage(id, prompt));
      } else if (messageId) {
        await wechat.media.setChatImage(id, messageId, image, prompt);
        setSaved(true);
      } else {
        const sent = await wechat.sendContent(
          id,
          { type: "image", description, prompt, image },
          sendMode,
        );
        if (sent) {
          setSaved(true);
        } else {
          const reply = wechat.getSnapshot().reply;
          setError(reply.status === "error" ? reply.error : "图片未发送，请重试。");
        }
      }
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") {
        setError((cause as Error).message);
      }
    } finally {
      setAction(null);
    }
  }
  function back() {
    if (!action && !saved) {
      if (changed) {
        setDiscard(true);
      } else {
        navigation.pop();
      }
    }
  }
  return {
    description,
    setDescription,
    prompt,
    setPrompt,
    image,
    setImage,
    changed,
    action,
    error,
    discard,
    setDiscard,
    unavailable,
    locked,
    run,
    back,
  };
}

export function WechatChatImage(props: ImagePageProps) {
  const { messageId, navigation, active, sendMode } = props;
  const form = useChatImage(props);
  const title = messageId ? "图片" : "发送图片";
  const submitLabel = messageId ? "保存" : sendMode === "delayed" ? "加入队列" : "发送";
  return (
    <>
      <Page
        inert={form.discard}
        className="wechat-media-page"
        navBar={<NavBar title={title} back={{ label: "聊天", onClick: form.back }} />}
      >
        {form.unavailable ? (
          <p className="wechat-notice">这条图片消息已不可用。</p>
        ) : (
          <div className="wechat-media-form" aria-busy={!!form.action}>
            <WechatChatImagePreview
              image={form.image}
              description={form.description}
              onOpen={() =>
                navigation.push({
                  page: "moment-image-view",
                  imagePath: form.image!.imagePath,
                  description: form.description.trim() || "聊天图片",
                })
              }
            />
            {messageId ? (
              <section className="wechat-media-caption">
                <h2>图片描述</h2>
                <p>{form.description}</p>
              </section>
            ) : (
              <label className="wechat-form-field">
                <span>图片描述</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => form.setDescription(e.target.value)}
                  disabled={!!form.action}
                  placeholder="简单写写图片里有什么"
                />
              </label>
            )}
            <label className="wechat-form-field">
              <span>绘图 Prompt</span>
              <textarea
                rows={4}
                value={form.prompt}
                onChange={(e) => form.setPrompt(e.target.value)}
                disabled={!!form.action}
                placeholder="人物、场景、光线和构图"
              />
            </label>
            <div className="wechat-media-tools">
              <Button
                disabled={form.locked}
                onClick={() =>
                  navigation.push({
                    page: "moment-image-picker",
                    selectedKey: form.image && galleryImageKey(form.image),
                    onSelect: async (selected) => {
                      form.setImage(galleryImageReference(selected));
                      const sourceDescription = selected.description;
                      if (!messageId && sourceDescription?.trim()) {
                        form.setDescription((current) =>
                          current.trim() ? current : sourceDescription,
                        );
                      }
                      const sourcePrompt = selected.generation?.prompt;
                      if (sourcePrompt?.trim()) {
                        form.setPrompt((current) => (current.trim() ? current : sourcePrompt));
                      }
                    },
                  })
                }
              >
                从图库选图
              </Button>
              <Button
                disabled={form.locked || !form.description.trim()}
                onClick={() => void form.run("refine")}
              >
                {form.action === "refine" ? "完善中…" : "AI 完善 Prompt"}
              </Button>
              <Button
                disabled={form.locked || !form.prompt.trim()}
                onClick={() => void form.run("generate")}
              >
                {form.action === "generate" ? "生成中…" : "生成图片"}
              </Button>
            </div>
            {form.error && (
              <p className="wechat-form-error" role="alert">
                {form.error}
              </p>
            )}
            <Button
              className="wechat-media-submit"
              variant="filled"
              disabled={form.locked || !form.description.trim() || (!!messageId && !form.changed)}
              onClick={() => void form.run("save")}
            >
              {form.action === "save" ? "保存中…" : submitLabel}
            </Button>
          </div>
        )}
      </Page>
      {form.discard && (
        <Alert
          active={active}
          title="舍弃图片修改？"
          onDismiss={() => form.setDiscard(false)}
          actions={[
            { label: "继续编辑", onClick: () => form.setDiscard(false) },
            { label: "舍弃", onClick: navigation.pop },
          ]}
        >
          未保存的内容将被舍弃。
        </Alert>
      )}
    </>
  );
}

function WechatChatImagePreview({
  image,
  description,
  onOpen,
}: {
  image: GalleryImageReference | undefined;
  description: string;
  onOpen(): void;
}) {
  const { imageUrl } = useGallery();
  return (
    <div className="wechat-media-frame">
      {image ? (
        <button
          type="button"
          className="wechat-media-preview"
          aria-label="查看大图"
          onClick={onOpen}
        >
          <img src={imageUrl(image.imagePath)} alt={description.trim() || "聊天图片"} />
          <span className="wechat-media-preview-hint" aria-hidden="true">
            查看大图
          </span>
        </button>
      ) : (
        <div className="wechat-media-empty" aria-label="尚未选择图片">
          <WechatImageIcon />
          <span>尚未选择图片</span>
        </div>
      )}
    </div>
  );
}
