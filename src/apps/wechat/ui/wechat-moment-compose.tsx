import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";
import type { MomentMedia } from "../wechat-moments.ts";
import { MomentMediaEditor } from "./wechat-moment-media-editor.tsx";
import { useMomentCompose, type MomentComposeProps } from "./use-wechat-moment-compose.ts";
import { momentWritingReason } from "./wechat-moment-content.tsx";

export function WechatMomentCompose(props: MomentComposeProps) {
  const { state, scopeId, active } = props;
  const editor = useMomentCompose(props);
  const reason = momentWritingReason(state, scopeId);
  const locked = editor.status !== "editing" || editor.imageBusy;
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
            <p className="wechat-notice">以 {editor.draft.author.name} 的身份发布</p>
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
              onChoose={editor.chooseImage}
              onRefine={(index) => void editor.imageTask(index, "refine")}
              onGenerate={(index) => void editor.imageTask(index, "generate")}
            />
            {editor.imageError ? (
              <p className="wechat-notice" role="alert">
                {editor.imageError}
              </p>
            ) : null}
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
