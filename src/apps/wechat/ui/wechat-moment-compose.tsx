import { useEffect, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";
import type { MomentContent, MomentMedia } from "../wechat-moments.ts";
import type { WechatPageProps } from "./wechat-page.tsx";
import { MomentMediaEditor } from "./wechat-moment-media-editor.tsx";
import { momentWritingReason } from "./wechat-moment-content.tsx";

type Confirmation = { type: "discard" } | { type: "media"; media: MomentMedia } | null;

function useMomentCompose({
  wechat,
  navigation,
  active,
  onPublished,
}: WechatPageProps & { active: boolean; onPublished(): void }) {
  const [draft, setDraft] = useState<MomentContent>({ text: "", media: { type: "none" } });
  const [status, setStatus] = useState<"editing" | "saving" | "saved">("editing");
  const [error, setError] = useState<string | null>(null);
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
      await wechat.moments.publish(draft);
      setStatus("saved");
    } catch (error) {
      setStatus("editing");
      setError((error as Error).message);
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
        ? { type, descriptions: [""] }
        : type === "video"
          ? { type, description: "" }
          : { type };
    const hasDescription =
      draft.media.type === "images"
        ? draft.media.descriptions.some((item) => item.length)
        : draft.media.type === "video" && !!draft.media.description;
    if (hasDescription) {
      setConfirmation({ type: "media", media });
    } else {
      setDraft({ ...draft, media });
    }
  }
  function confirm() {
    if (confirmation?.type === "discard") {
      navigation.pop();
    } else if (confirmation?.type === "media") {
      setDraft({ ...draft, media: confirmation.media });
    }
    setConfirmation(null);
  }
  return {
    draft,
    setDraft,
    status,
    error,
    confirmation,
    setConfirmation,
    publish,
    back,
    selectMedia,
    confirm,
  };
}

export function WechatMomentCompose(
  props: WechatPageProps & { scopeId: string; active: boolean; onPublished(): void },
) {
  const { state, scopeId, active } = props;
  const editor = useMomentCompose(props);
  const reason = momentWritingReason(state, scopeId);
  const locked = editor.status !== "editing";
  return (
    <>
      <div className="wechat-moment-page" inert={!!editor.confirmation}>
        <Page
          navBar={
            <NavBar
              title="发布动态"
              back={{ label: "朋友圈", onClick: editor.back }}
              right={
                <Button
                  className="wechat-moment-primary"
                  disabled={locked || !!reason}
                  onClick={() => void editor.publish()}
                >
                  {editor.status === "saving" ? "保存中" : "发布"}
                </Button>
              }
            />
          }
        >
          <div className="wechat-moment-editor">
            <p className="wechat-notice">
              以{" "}
              {state.people.find((person) => person.id === state.data.account?.id)?.name ??
                "当前帐号"}{" "}
              的身份发布
            </p>
            {reason ? <p className="wechat-notice">{reason}</p> : null}
            <label className="wechat-moment-label">
              正文
              <textarea
                rows={6}
                placeholder="分享此刻的日常…"
                value={editor.draft.text}
                disabled={locked}
                onChange={(event) => editor.setDraft({ ...editor.draft, text: event.target.value })}
              />
            </label>
            <SegmentedControl
              label="媒体类型"
              value={editor.draft.media.type}
              onValueChange={(value) => editor.selectMedia(value as MomentMedia["type"])}
              options={[
                { value: "none", label: "纯文字", disabled: locked },
                { value: "images", label: "图片", disabled: locked },
                { value: "video", label: "视频", disabled: locked },
              ]}
            />
            <MomentMediaEditor
              media={editor.draft.media}
              disabled={locked}
              onChange={(media) => editor.setDraft({ ...editor.draft, media })}
            />
            {editor.error ? (
              <p className="wechat-notice" role="alert">
                {editor.error}
              </p>
            ) : null}
          </div>
        </Page>
      </div>
      {editor.confirmation ? (
        <Alert
          active={active}
          title={editor.confirmation.type === "discard" ? "舍弃动态？" : "切换媒体类型？"}
          onDismiss={() => editor.setConfirmation(null)}
          actions={[
            { label: "继续编辑", onClick: () => editor.setConfirmation(null) },
            { label: "舍弃", onClick: editor.confirm },
          ]}
        >
          {editor.confirmation.type === "discard"
            ? "尚未发布的内容将被舍弃。"
            : "当前媒体描述将被舍弃，正文会保留。"}
        </Alert>
      ) : null}
    </>
  );
}
