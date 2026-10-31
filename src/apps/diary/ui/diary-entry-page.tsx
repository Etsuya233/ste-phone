import { useState } from "react";
import type { DiaryEntry } from "../diary.ts";
import { isDiaryRunning } from "../diary.ts";
import { formatWrittenAt } from "../diary-time.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiarySheet, DiarySheetHeading, useDiaryCopy } from "./diary-paper.tsx";

export function DiaryDetailPage(props: DiaryPageProps & { id: string }) {
  const entry = props.state.data.entries.find((item) => item.id === props.id);
  if (!entry)
    return (
      <DiaryPage state={props.state} title="日记" onBack={props.navigation.pop} backLabel="日记本">
        <p className="diary-missing">这篇日记已经不在日记本里了。</p>
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
  const { message: copyMessage, copy } = useDiaryCopy(entry.body);
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
        title="日记"
        onBack={navigation.pop}
        backLabel="日记本"
        inert={deleting}
        error={error}
      >
        <div className="diary-reader">
          <DiarySheet toneName={entry.author.name} className="diary-sheet--reading">
            <DiarySheetHeading worldTime={entry.worldTime} />
            <div className="diary-body">{entry.body}</div>
            <p className="diary-signature">
              <span aria-hidden="true">——</span>
              {entry.author.name}
            </p>
          </DiarySheet>
          <p className="diary-written-at">{formatWrittenAt(entry.createdAt)}</p>
          <div className="diary-read-actions">
            <Button onClick={() => void copy()}>复制这一页</Button>
            <Button disabled={busy} onClick={onWrite}>
              再写一篇
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => setDeleting(true)}>
              删除
            </Button>
          </div>
          {copyMessage ? (
            <p className="diary-copy-status" role="status">
              {copyMessage}
            </p>
          ) : null}
        </div>
      </DiaryPage>
      {deleting ? (
        <Alert
          title="删除这一页？"
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
