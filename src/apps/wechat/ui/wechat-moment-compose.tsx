import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { momentDraftIssue } from "../wechat-moments.ts";
import { useMomentCompose, type MomentComposeProps } from "./use-wechat-moment-compose.ts";
import { momentWritingReason } from "./wechat-moment-content.tsx";
import { MomentComposeForm } from "./wechat-moment-compose-form.tsx";
import { MomentComposeImage } from "./wechat-moment-compose-image.tsx";

export function WechatMomentCompose(props: MomentComposeProps) {
  const { state, scopeId, active } = props;
  const editor = useMomentCompose(props);
  const reason = momentWritingReason(state, scopeId);
  const locked = editor.status !== "editing" || editor.imageBusy;
  const issue = momentDraftIssue(editor.draft);
  const editingImage =
    editor.editingImage !== null &&
    editor.draft.media.type === "images" &&
    editor.draft.media.items[editor.editingImage]
      ? editor.editingImage
      : null;
  return (
    <>
      <div className="wechat-moment-page" inert={!!editor.confirmation}>
        {editingImage === null ? (
          <Page
            navBar={
              <NavBar
                title="发布动态"
                back={{ label: "返回", onClick: editor.back }}
                right={
                  <Button
                    className="wechat-moment-primary"
                    disabled={locked || !!reason || !!issue}
                    onClick={() => void editor.publish()}
                  >
                    {editor.status === "saving" ? "保存中" : "发布"}
                  </Button>
                }
              />
            }
          >
            <MomentComposeForm
              editor={editor}
              state={state}
              reason={reason}
              locked={locked}
              issue={issue}
            />
          </Page>
        ) : (
          <Page
            navBar={
              <NavBar
                title={`图片 ${editingImage + 1}`}
                back={{ label: "返回", onClick: editor.closeImage }}
                right={<Button onClick={editor.closeImage}>完成</Button>}
              />
            }
          >
            <MomentComposeImage editor={editor} index={editingImage} />
          </Page>
        )}
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
