import type { AppId } from "../../../core/launcher/catalog.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import type { NotesService } from "../notes-service.ts";
import type { NotesRole } from "../notes.ts";
import { NotesSparkleIcon } from "./notes-icons.tsx";
import { useNotesWriting } from "./use-notes-writing.ts";
import { useLayoutEffect, useState, type RefObject } from "react";

export function NotesWriting({
  writing,
  onGenerate,
  onAccept,
  onOpen,
  disabled = false,
  focusInstruction = false,
}: {
  writing: ReturnType<typeof useNotesWriting>;
  onGenerate: () => void;
  onAccept: (text: string) => void;
  onOpen: (app: AppId) => void;
  disabled?: boolean;
  focusInstruction?: boolean;
}) {
  const { state, instruction, setInstruction, discard } = writing;
  if (state.stage === "prompt") {
    return (
      <form
        className="notes-writing"
        onSubmit={(event) => {
          event.preventDefault();
          onGenerate();
        }}
      >
        <div className="notes-writing-head">
          <span className="notes-writing-mark" aria-hidden="true">
            <NotesSparkleIcon />
          </span>
          <h2>写作指令</h2>
        </div>
        <textarea
          aria-label="写作指令"
          placeholder="想写些什么？"
          rows={3}
          value={instruction}
          autoFocus={focusInstruction}
          disabled={disabled}
          onChange={(event) => setInstruction(event.target.value)}
        />
        {state.error ? <p role="alert">{state.error}</p> : null}
        <div className="notes-actions">
          {state.error?.includes("默认模型连接") ? (
            <Button disabled={disabled} onClick={() => onOpen("settings")}>
              打开设置
            </Button>
          ) : null}
          <Button
            type="submit"
            className="notes-writing-primary"
            disabled={disabled || !instruction.trim()}
          >
            {state.error ? "重新生成" : "生成文字"}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <section className="notes-writing notes-writing--preview" aria-label="AI 文字预览">
      <div className="notes-writing-head">
        <span className="notes-writing-mark" aria-hidden="true">
          <NotesSparkleIcon />
        </span>
        <h2>候选文字</h2>
      </div>
      <p className="notes-writing-text">{state.text || <span role="status">正在生成文字…</span>}</p>
      <div className="notes-actions">
        {state.stage === "generating" ? (
          <Button onClick={discard}>停止</Button>
        ) : (
          <>
            <Button onClick={discard}>放弃</Button>
            <Button className="notes-writing-primary" onClick={() => onAccept(state.text)}>
              使用文字
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function NotesAiNewPage({
  notes,
  role,
  current,
  onBack,
  onOpen,
  onAccept,
  quitBlocked,
}: {
  notes: NotesService;
  role: NotesRole;
  current: boolean;
  onBack: () => void;
  onOpen: (app: AppId) => void;
  onAccept: (text: string) => void;
  quitBlocked: RefObject<boolean>;
}) {
  const writing = useNotesWriting(notes, role);
  const [confirm, setConfirm] = useState(false);
  const hasResult = writing.state.stage !== "prompt";
  useLayoutEffect(() => {
    quitBlocked.current = hasResult;
    return () => {
      quitBlocked.current = false;
    };
  }, [quitBlocked, hasResult]);

  return (
    <>
      <Page
        className="notes-page notes-ai-page"
        inert={confirm}
        navBar={
          <NavBar
            back={{ label: "备忘录", onClick: hasResult ? () => setConfirm(true) : onBack }}
          />
        }
      >
        <header className="notes-ai-intro">
          <h1 className="notes-display">AI 新建</h1>
        </header>
        <div className="notes-ai-body">
          <NotesWriting
            writing={writing}
            onGenerate={() => void writing.generate()}
            onOpen={onOpen}
            onAccept={onAccept}
          />
        </div>
      </Page>
      {confirm ? (
        <Alert
          title="放弃本次 AI 写作？"
          active={current}
          onDismiss={() => setConfirm(false)}
          actions={[
            { label: "取消", onClick: () => setConfirm(false) },
            {
              label: "放弃",
              onClick: () => {
                writing.discard();
                setConfirm(false);
                onBack();
              },
            },
          ]}
        >
          未采用的内容会被舍弃。
        </Alert>
      ) : null}
    </>
  );
}
