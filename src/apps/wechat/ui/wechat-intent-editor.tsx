import { useEffect, useRef } from "react";
import type { WechatIntent, WechatIntentService } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { WechatIntentFields } from "./wechat-intent-fields.tsx";
import { useWechatIntentEditor } from "./use-wechat-intent-editor.ts";

export function WechatIntentEditor({
  service,
  preset,
  active,
  onBack,
  onPreview,
}: {
  service: WechatIntentService;
  preset: WechatIntent | null;
  active: boolean;
  onBack(): void;
  onPreview(preset: WechatIntent): void;
}) {
  const editor = useWechatIntentEditor(service, preset, onBack);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (active && editor.error) {
      errorElement.current?.focus();
    }
  }, [active, editor.error]);
  function preview() {
    try {
      onPreview(editor.readDraft());
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : String(error));
    }
  }
  const leave = () => {
    if (editor.busy) {
      return;
    }
    if (editor.dirty) {
      editor.setConfirmation("discard");
    } else {
      onBack();
    }
  };
  return (
    <>
      <Page
        className="wechat-intent-page"
        inert={editor.confirmation !== null}
        navBar={
          <NavBar
            title={preset ? "编辑 Intent" : "新建 Intent"}
            back={{ label: "App Intent", onClick: leave }}
            right={
              <Button disabled={editor.busy} onClick={() => void editor.save()}>
                {editor.busy ? "保存中…" : "保存"}
              </Button>
            }
          />
        }
      >
        {editor.error ? (
          <p ref={errorElement} tabIndex={-1} className="wechat-intent-error" role="alert">
            {editor.error}
          </p>
        ) : null}
        <WechatIntentFields
          draft={editor.draft}
          busy={editor.busy}
          scopes={editor.scopes}
          onChange={editor.change}
        />
        <div className="wechat-intent-actions">
          <Button disabled={editor.busy} onClick={preview}>
            预览展开内容
          </Button>
        </div>
        <p className="wechat-intent-note">
          保存后，可在手机「设置 → ST 接入」中为这个 App Intent 定义宏。
        </p>
        {preset ? (
          <div className="wechat-intent-actions">
            <Button
              variant="danger"
              disabled={editor.busy}
              onClick={() => editor.setConfirmation("delete")}
            >
              删除 Intent
            </Button>
          </div>
        ) : null}
      </Page>
      {editor.confirmation ? (
        <Alert
          title={editor.confirmation === "discard" ? "舍弃未保存的修改？" : "删除这个 Intent？"}
          active={active}
          busy={editor.busy}
          onDismiss={() => {
            if (!editor.busy) {
              editor.setConfirmation(null);
            }
          }}
          actions={[
            { label: "取消", disabled: editor.busy, onClick: () => editor.setConfirmation(null) },
            {
              label: editor.confirmation === "discard" ? "舍弃" : "删除",
              disabled: editor.busy,
              onClick: editor.confirmation === "discard" ? onBack : () => void editor.save(true),
            },
          ]}
        >
          {editor.confirmation === "discard"
            ? "已保存的 Intent保持原样。"
            : "删除后，引用这个 App Intent 的宏将报告引用失效。"}
        </Alert>
      ) : null}
    </>
  );
}
