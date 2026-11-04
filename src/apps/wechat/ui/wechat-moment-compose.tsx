import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { momentDraftIssue } from "../wechat-moments.ts";
import { useMomentCompose, type MomentComposeProps } from "./use-wechat-moment-compose.ts";
import { momentWritingReason } from "./wechat-moment-content.tsx";
import { MomentComposeForm } from "./wechat-moment-compose-form.tsx";
import { MomentComposeMedia } from "./wechat-moment-compose-media.tsx";

export function WechatMomentCompose(props: MomentComposeProps) {
  const { state, scopeId, active } = props;
  const editor = useMomentCompose(props);
  const reason = momentWritingReason(state, scopeId);
  const locked = editor.status !== "editing" || editor.imageBusy;
  const issue = momentDraftIssue(editor.draft);
  const editingMedia = editor.editingMedia;
  return (
    <>
      <div className="wechat-moment-page" inert={editor.discard}>
        {editingMedia === null ? (
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
                title={`${editor.draft.media[editingMedia]!.type === "image" ? "图片" : "视频"} ${editingMedia + 1}`}
                back={{ label: "返回", onClick: editor.closeMedia }}
                right={<Button onClick={editor.closeMedia}>完成</Button>}
              />
            }
          >
            <MomentComposeMedia editor={editor} index={editingMedia} />
          </Page>
        )}
      </div>
      {editor.discard ? (
        <Alert
          active={active}
          title="舍弃动态？"
          onDismiss={() => editor.setDiscard(false)}
          actions={[
            { label: "继续编辑", onClick: () => editor.setDiscard(false) },
            { label: "舍弃", onClick: editor.discardDraft },
          ]}
        >
          尚未发布的内容将被舍弃。
        </Alert>
      ) : null}
    </>
  );
}
