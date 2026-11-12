import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AppId } from "../../../core/launcher/catalog.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import type { GalleryPublic } from "../../gallery/public.ts";
import type { NotesService } from "../notes-service.ts";
import type { NotesRoute } from "./notes-app.tsx";
import { NotesEditor, type NotesEditorHandle } from "./notes-editor.tsx";
import { NotesImageIcon, NotesSparkleIcon, NotesTrashIcon } from "./notes-icons.tsx";
import { NotesWriting } from "./notes-writing.tsx";
import { useNoteDraft, type NotesDraftStart } from "./use-note-draft.ts";
import { useNotesWriting } from "./use-notes-writing.ts";

export type { NotesDraftStart } from "./use-note-draft.ts";

const confirmations = {
  writing: { title: "放弃本次 AI 写作？", message: "未采用的内容会被舍弃。", action: "放弃" },
  draft: {
    title: "舍弃未保存的修改？",
    message: "返回列表后，未保存的修改会被舍弃。",
    action: "舍弃",
  },
  delete: { title: "删除这条备忘录？", message: "删除后无法恢复。", action: "删除" },
};

export function NotesEditPage({
  notes,
  gallery,
  navigation,
  onOpen,
  quitBlocked,
  draft,
}: {
  notes: NotesService;
  gallery: GalleryPublic;
  navigation: Navigation<NotesRoute>;
  onOpen: (app: AppId) => void;
  quitBlocked: RefObject<boolean>;
  draft: NotesDraftStart;
}) {
  const editor = useRef<NotesEditorHandle>(null);
  const body = useRef<HTMLDivElement>(null);
  const insertionPoint = useRef(0);
  const [showWriting, setShowWriting] = useState(false);
  const [confirmation, setConfirmation] = useState<keyof typeof confirmations | null>(null);
  const editing = useNoteDraft(notes, draft, navigation);
  const writing = useNotesWriting(notes);
  const writingLocked = writing.state.stage !== "prompt";
  const readonly = editing.busy || writingLocked;
  const blocksQuit = editing.phase !== "leaving" && (editing.changed || writingLocked);
  useLayoutEffect(() => {
    quitBlocked.current = blocksQuit;
    return () => {
      quitBlocked.current = false;
    };
  }, [quitBlocked, blocksQuit]);
  useLayoutEffect(() => {
    if (editing.error && navigation.current) {
      // 顶栏提交时可能停在长文末尾，失败后让原页内的提示可见。
      body.current!.parentElement!.scrollTop = 0;
    }
  }, [editing.error, navigation.current]);

  function saveAndReturn() {
    if (writingLocked) {
      setConfirmation("writing");
    } else {
      void editing.saveAndReturn();
    }
  }

  function confirm() {
    setConfirmation(null);
    switch (confirmation) {
      case "writing":
        writing.discard();
        setShowWriting(false);
        void editing.saveAndReturn();
        break;
      case "draft":
        navigation.pop();
        break;
      case "delete":
        void editing.deleteAndReturn();
        break;
    }
  }

  function pickImage() {
    const position = editor.current!.getInsertionPoint();
    navigation.push({
      page: "pick-image",
      onChoose: (image) => editor.current!.insertImageAt(position, image),
    });
  }

  const alert = confirmation ? confirmations[confirmation] : null;
  return (
    <>
      <Page
        className="notes-page notes-edit-page"
        inert={alert !== null}
        navBar={
          <NavBar
            title={draft.role.name}
            back={editing.busy ? undefined : { label: "备忘录", onClick: saveAndReturn }}
            right={
              <Button disabled={editing.busy} onClick={saveAndReturn}>
                完成
              </Button>
            }
          />
        }
        footer={
          <div className="notes-edit-footer">
            <div className="notes-edit-tools" role="group" aria-label="备忘录编辑">
              <Button className="notes-edit-tool" disabled={readonly} onClick={pickImage}>
                <NotesImageIcon />
                插入图片
              </Button>
              <Button
                className="notes-edit-tool"
                disabled={readonly}
                aria-expanded={showWriting}
                onClick={() => setShowWriting((shown) => !shown)}
              >
                <NotesSparkleIcon />
                AI 写作
              </Button>
            </div>
            {draft.persisted ? (
              <Button
                variant="danger"
                className="notes-edit-delete"
                disabled={readonly}
                onClick={() => setConfirmation("delete")}
              >
                <NotesTrashIcon />
                删除
              </Button>
            ) : null}
          </div>
        }
        footerHeight={56}
      >
        <div className="notes-edit-body" ref={body}>
          {showWriting ? (
            <NotesWriting
              writing={writing}
              disabled={editing.busy}
              focusInstruction={navigation.current}
              onOpen={onOpen}
              onGenerate={() => {
                insertionPoint.current = editor.current!.getInsertionPoint();
                void writing.generate();
              }}
              onAccept={(text) => {
                editor.current!.insertTextAt(insertionPoint.current, text);
                writing.discard();
                setShowWriting(false);
              }}
            />
          ) : null}
          {editing.error ? (
            <div className="notes-notice notes-notice--error" role="alert">
              <p>{editing.error}</p>
              {editing.changed ? (
                <Button disabled={readonly} onClick={() => setConfirmation("draft")}>
                  舍弃修改
                </Button>
              ) : null}
            </div>
          ) : null}
          {editing.phase === "saving" || editing.phase === "deleting" ? (
            <p className="notes-notice" role="status">
              {editing.phase === "saving" ? "正在保存…" : "正在删除…"}
            </p>
          ) : null}
          <div className="notes-editor-surface">
            <NotesEditor
              ref={editor}
              initialBlocks={draft.blocks}
              readOnly={readonly}
              onChange={editing.setBlocks}
              imageUrl={gallery.imageUrl}
              onOpenImage={(image) => {
                if (!readonly) {
                  navigation.push({ page: "view-image", image });
                }
              }}
            />
          </div>
        </div>
      </Page>
      {alert ? (
        <Alert
          title={alert.title}
          active={navigation.current}
          onDismiss={() => setConfirmation(null)}
          actions={[
            { label: "取消", onClick: () => setConfirmation(null) },
            { label: alert.action, onClick: confirm },
          ]}
        >
          {alert.message}
        </Alert>
      ) : null}
    </>
  );
}
