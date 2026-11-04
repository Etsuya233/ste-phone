import { useState } from "react";
import { useImagePromptDraft } from "./use-image-prompt-draft.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { type DiaryEntry } from "../diary.ts";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryImagePromptPage(props: DiaryPageProps & { id: string }) {
  const entry = props.state.data.entries.find((item) => item.id === props.id);
  if (!entry) {
    return (
      <DiaryPage state={props.state} title="配图描述" onBack={props.navigation.pop}>
        <p className="diary-message">这篇日记已经不在日记本里了。</p>
      </DiaryPage>
    );
  }
  return <ImagePromptEditor {...props} entry={entry} />;
}

function ImagePromptEditor({
  diary,
  state,
  navigation,
  entry,
}: DiaryPageProps & { entry: DiaryEntry }) {
  const [discard, setDiscard] = useState(false);
  const { prompt, setPrompt, busy, dirty, task, error, message, submit, extract } =
    useImagePromptDraft(diary, state, entry);
  function back() {
    if (dirty) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }
  return (
    <>
      <DiaryPage
        state={state}
        title="配图描述"
        onBack={back}
        backLabel="日记"
        inert={discard}
        error={error}
      >
        <div className="diary-image-editor">
          <label htmlFor={`diary-prompt-${entry.id}`}>想把怎样的画面留在这一页？</label>
          <textarea
            id={`diary-prompt-${entry.id}`}
            rows={9}
            value={prompt}
            disabled={busy}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <p>描述会随日记保存，生成时使用已保存的描述。</p>
          <div className="diary-write-buttons">
            {!entry.imagePrompt ? (
              <Button disabled={busy || dirty} onClick={() => void extract()}>
                从正文提炼描述
              </Button>
            ) : null}
            <Button disabled={busy || !prompt.trim() || !dirty} onClick={() => void submit(false)}>
              保存描述
            </Button>
            <Button
              variant="filled"
              disabled={busy || !prompt.trim()}
              onClick={() => void submit(true)}
            >
              保存并生成配图
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
          {busy ? (
            <p role="status">
              {task.status === "prompting"
                ? "正在构思画面…"
                : task.status === "generating"
                  ? "正在生成配图…"
                  : "正在保存…"}
            </p>
          ) : null}
        </div>
      </DiaryPage>
      {discard ? (
        <Alert
          title="舍弃未保存的描述？"
          active={navigation.current}
          onDismiss={() => setDiscard(false)}
          actions={[
            { label: "继续编辑", primary: true, onClick: () => setDiscard(false) },
            { label: "舍弃", onClick: navigation.pop },
          ]}
        >
          <p>尚未保存的修改会丢失。</p>
        </Alert>
      ) : null}
    </>
  );
}
