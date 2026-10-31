import { useState } from "react";
import type { DiaryEntry } from "../diary.ts";
import { isDiaryRunning } from "../diary.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryDetailPage(props: DiaryPageProps & { id: string }) {
  const entry = props.state.data.entries.find((item) => item.id === props.id);
  if (!entry)
    return (
      <DiaryPage state={props.state} title="日记详情" onBack={props.navigation.pop}>
        <p className="diary-message">这篇日记已删除。</p>
      </DiaryPage>
    );
  function writeAnother() {
    props.diary.startWriting();
    props.navigation.push({ page: "write" });
  }
  return <DiaryEntryPage {...props} entry={entry} onWrite={writeAnother} />;
}

export function DiaryEntryPage({
  diary,
  state,
  navigation,
  entry,
  onWrite,
}: DiaryPageProps & {
  entry: DiaryEntry;
  onWrite: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = state.preparing || isDiaryRunning(state.generation);
  async function deleteEntry() {
    setDeleting(false);
    setError(null);
    try {
      await diary.deleteEntry(entry.id);
      navigation.pop();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <>
      <DiaryPage
        state={state}
        title="日记详情"
        onBack={navigation.pop}
        inert={deleting}
        error={error}
      >
        <div className="diary-heading">
          <p className="diary-author">{entry.author.name}</p>
          <p className="diary-time">{entry.worldTime}</p>
        </div>
        <DiaryText body={entry.body} />
        <div className="diary-entry-actions">
          <Button disabled={busy} onClick={onWrite}>
            再写一篇
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setDeleting(true)}>
            删除日记
          </Button>
        </div>
      </DiaryPage>
      {deleting ? (
        <Alert
          title="删除这篇日记？"
          active={navigation.current}
          onDismiss={() => setDeleting(false)}
          actions={[
            { label: "保留", onClick: () => setDeleting(false), primary: true },
            { label: "删除", onClick: () => void deleteEntry() },
          ]}
        >
          <p>删除后无法恢复。</p>
        </Alert>
      ) : null}
    </>
  );
}

export function DiaryText({ body }: { body: string }) {
  const [message, setMessage] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setMessage("已复制正文");
    } catch (error) {
      setMessage(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return (
    <>
      <article className="diary-body">{body}</article>
      <div className="diary-copy">
        <Button onClick={() => void copy()}>复制正文</Button>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </>
  );
}
