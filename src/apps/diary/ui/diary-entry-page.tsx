import { DiaryEntryImage } from "./diary-entry-image.tsx";
import { useState } from "react";
import type { DiaryEntry } from "../diary.ts";
import { isDiaryImageTaskRunning, isDiaryRunning } from "../diary.ts";
import { readDiaryBooks, sameDiaryAuthor } from "../diary-books.ts";
import { formatWrittenAt } from "../diary-time.ts";
import { ActionSheet } from "../../../frontend/foundation/action-sheet.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Icon } from "../../../frontend/foundation/icon.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiarySheet, DiarySheetHeading, useDiaryCopy } from "./diary-paper.tsx";

type DiaryEntryPageProps = Pick<DiaryPageProps, "diary" | "state" | "navigation"> & {
  entry: DiaryEntry;
  onWrite: () => void | Promise<void>;
};

export function DiaryDetailPage(props: DiaryPageProps & { id: string; fromBookKey: string }) {
  const entry = props.state.data.entries.find((item) => item.id === props.id);
  const books = readDiaryBooks(props.state.authors, props.state.data.entries);
  const source = books.find((book) => book.key === props.fromBookKey);

  if (!entry) {
    return (
      <DiaryPage state={props.state} title="日记" onBack={props.navigation.pop} backLabel="日记本">
        <p className="diary-missing">这篇日记已经不在日记本里了。</p>
      </DiaryPage>
    );
  }

  async function writeAnother() {
    if (!props.state.chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    if (source?.kind === "person") {
      if (source.unavailable) {
        throw new Error("这位人物已不在当前资料中，无法继续写");
      }
      const pending =
        props.state.generation.status === "save-error" ? props.state.generation.entry.author : null;
      if (pending && !sameDiaryAuthor(pending, source.author)) {
        throw new Error(`${pending.name} 的这一页还没收好，先去那本日记里收好再写`);
      }
      if (
        isDiaryRunning(props.state.generation) &&
        !sameDiaryAuthor(props.state.data.author, source.author)
      ) {
        throw new Error(`正在写 ${props.state.data.author?.name ?? "其他人"} 的日记，请稍后再写`);
      }
      if (!sameDiaryAuthor(props.state.data.author, source.author)) {
        await props.diary.selectAuthor(source.author!.id);
      }
    }
    props.diary.startWriting();
    props.navigation.push({ page: "write" });
  }

  return (
    <DiaryEntryPage
      diary={props.diary}
      state={props.state}
      navigation={props.navigation}
      entry={entry}
      onWrite={writeAnother}
    />
  );
}

export function DiaryEntryPage({ diary, state, navigation, entry, onWrite }: DiaryEntryPageProps) {
  const [confirm, setConfirm] = useState<"remove-image" | "delete" | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { message: copyMessage, copy } = useDiaryCopy(entry.body);
  const busy =
    state.preparing || isDiaryRunning(state.generation) || isDiaryImageTaskRunning(state.imageTask);

  async function writeAnother() {
    setError(null);
    try {
      await onWrite();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function deleteEntry() {
    setConfirm(null);
    setError(null);
    try {
      await diary.deleteEntry(entry.id);
      navigation.pop();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function removeEntryImage() {
    setConfirm(null);
    setError(null);
    try {
      await diary.removeImage(entry.id);
    } catch {
      // 移除失败由 imageTask 在配图区展示，这里捕获拒绝避免未处理。
    }
  }

  return (
    <>
      <DiaryPage
        state={state}
        title="日记"
        onBack={navigation.pop}
        backLabel="日记本"
        inert={confirm !== null || actionsOpen}
        error={error}
        right={
          <Button
            className="diary-more"
            aria-label="更多操作"
            aria-haspopup="dialog"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen(true)}
          >
            <Icon className="diary-more-icon">
              <svg viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </Icon>
          </Button>
        }
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
          <DiaryEntryImage
            entry={entry}
            state={state}
            navigation={navigation}
            onRequestRemove={() => setConfirm("remove-image")}
          />
          <p className="diary-written-at">{formatWrittenAt(entry.createdAt)}</p>
          {copyMessage ? (
            <p className="diary-copy-status" role="status">
              {copyMessage}
            </p>
          ) : null}
        </div>
      </DiaryPage>
      {actionsOpen ? (
        <ActionSheet
          active={navigation.current}
          actions={[
            { label: "复制这一页", onClick: () => void copy() },
            {
              label: "再写一篇",
              disabled: busy,
              onClick: () => void writeAnother(),
            },
            {
              label: "删除",
              destructive: true,
              disabled: busy,
              onClick: () => setConfirm("delete"),
            },
          ]}
          onDismiss={() => setActionsOpen(false)}
        />
      ) : null}
      {confirm ? (
        <Alert
          title={confirm === "delete" ? "删除这一页？" : "移除这一页的配图？"}
          active={navigation.current}
          onDismiss={() => setConfirm(null)}
          actions={
            confirm === "delete"
              ? [
                  { label: "保留", onClick: () => setConfirm(null), primary: true },
                  { label: "删除", onClick: () => void deleteEntry() },
                ]
              : [
                  { label: "保留", onClick: () => setConfirm(null), primary: true },
                  { label: "移除", onClick: () => void removeEntryImage() },
                ]
          }
        >
          <p>
            {confirm === "delete" ? "删除后无法恢复。" : "图片仍保留在图库，配图描述也会保留。"}
          </p>
        </Alert>
      ) : null}
    </>
  );
}
