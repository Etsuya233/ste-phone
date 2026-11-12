import { useEffect, useRef } from "react";
import type { PhoneContextPreset, PhoneContextService } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { PhoneContextFields } from "./phone-context-fields.tsx";
import { useContextEditor } from "./use-context-editor.ts";

export function PhoneContextEditor({
  service,
  preset,
  active,
  onBack,
  onPreview,
}: {
  service: PhoneContextService;
  preset: PhoneContextPreset | null;
  active: boolean;
  onBack(): void;
  onPreview(preset: PhoneContextPreset): void;
}) {
  const editor = useContextEditor(service, preset, onBack);
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
        className="phone-context-page"
        inert={editor.confirmation !== null}
        navBar={
          <NavBar
            title={preset ? "编辑预设" : "新建预设"}
            back={{ label: "ST 上下文", onClick: leave }}
            right={
              <Button disabled={editor.busy} onClick={() => void editor.save()}>
                {editor.busy ? "保存中…" : "保存"}
              </Button>
            }
          />
        }
      >
        {editor.error ? (
          <p ref={errorElement} tabIndex={-1} className="phone-context-error" role="alert">
            {editor.error}
          </p>
        ) : null}
        <PhoneContextFields
          draft={editor.draft}
          editing={preset !== null}
          busy={editor.busy}
          sources={editor.sources}
          scopes={editor.scopes}
          onChange={editor.change}
          onSource={editor.selectSource}
        />
        <div className="phone-context-actions">
          <Button disabled={editor.busy} onClick={preview}>
            预览展开内容
          </Button>
          {preset ? (
            <Button disabled={editor.busy} onClick={() => void editor.copyMacro()}>
              复制宏
            </Button>
          ) : null}
        </div>
        {preset ? (
          <pre className="phone-context-output">{`{{phone::${preset.id}}}`}</pre>
        ) : (
          <p className="phone-context-note">保存后可复制宏，插入 ST 提示词。</p>
        )}
        {editor.notice ? (
          <p className="phone-context-note" role="status">
            {editor.notice}
          </p>
        ) : null}
        {preset ? (
          <div className="phone-context-actions">
            <Button
              variant="danger"
              disabled={editor.busy}
              onClick={() => editor.setConfirmation("delete")}
            >
              删除预设
            </Button>
          </div>
        ) : null}
      </Page>
      {editor.confirmation ? (
        <Alert
          title={editor.confirmation === "discard" ? "舍弃未保存的修改？" : "删除这个预设？"}
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
            ? "已保存的预设保持原样。"
            : "删除后，使用这个宏的提示词将无法找到该预设。"}
        </Alert>
      ) : null}
    </>
  );
}
