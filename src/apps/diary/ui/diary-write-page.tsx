import { useEffect } from "react";
import type { DiaryAuthor, DiarySnapshot } from "../diary.ts";
import { isDiaryRunning } from "../diary.ts";
import { sameDiaryAuthor } from "../diary-books.ts";
import { readDiaryMoment } from "../diary-time.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiaryEntryPage } from "./diary-entry-page.tsx";
import { DiaryAvatar, DiarySheet, DiarySheetHeading, useDiaryCopy } from "./diary-paper.tsx";

export function DiaryWritePage({ diary, state, navigation }: DiaryPageProps) {
  const { generation } = state;
  const writing = isDiaryRunning(generation);
  const busy = state.preparing || writing;
  const savedAuthor = state.data.author;
  const currentAuthor = state.authors.find((candidate) => sameDiaryAuthor(candidate, savedAuthor));
  const author: DiaryAuthor | null = currentAuthor ?? (state.preparing ? savedAuthor : null);
  const moment = readDiaryMoment(state.worldTime);
  // 保存失败时把重试放在纸页上方，长正文不会把它挤出首屏。
  const actionsAbove = generation.status === "save-error";

  useEffect(() => {
    if (navigation.current) {
      void diary.prepare();
    }
  }, [diary, navigation.current]);

  if (generation.status === "complete") {
    return (
      <DiaryEntryPage
        diary={diary}
        state={state}
        navigation={navigation}
        entry={state.data.entries.find((entry) => entry.id === generation.entry.id)!}
        onWrite={() => void diary.generate()}
      />
    );
  }

  const actions = writing ? null : (
    <WriteActions
      diary={diary}
      state={state}
      author={author}
      busy={busy}
      onChooseAuthor={() => navigation.push({ page: "authors" })}
    />
  );

  return (
    <DiaryPage
      state={state}
      title="写日记"
      onBack={navigation.pop}
      backLabel="日记本"
      right={
        writing ? (
          <Button disabled={generation.status === "saving"} onClick={() => diary.cancel()}>
            {generation.status === "saving" ? "正在收好…" : "停下笔"}
          </Button>
        ) : undefined
      }
    >
      <div className="diary-writer">
        <div className="diary-writer-meta">
          {author ? (
            <div className="diary-writer-author diary-writer-author--static">
              <DiaryAvatar path={author.avatar?.imagePath} name={author.name} size="small" />
              <span className="diary-writer-author-copy">
                <span className="diary-writer-label">执笔</span>
                <span className="diary-writer-name">{author.name}</span>
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="diary-writer-author"
              disabled={busy}
              onClick={() => navigation.push({ page: "authors" })}
            >
              <span
                className="diary-avatar diary-avatar--small diary-avatar--blank"
                aria-hidden="true"
              >
                ?
              </span>
              <span className="diary-writer-author-copy">
                <span className="diary-writer-label">还没有执笔人</span>
                <span className="diary-writer-name">选择一位</span>
              </span>
              <span className="diary-writer-change" aria-hidden="true">
                ›
              </span>
            </button>
          )}
          <span className="diary-writer-time">
            {moment?.clock ? `此刻 ${moment.clock}` : "此刻"}
          </span>
        </div>

        {actionsAbove ? actions : null}

        <DiarySheet toneName={author?.name ?? "日记"} className="diary-sheet--writing">
          <DiarySheetHeading worldTime={state.worldTime} />
          <WritingContent state={state} author={author} />
        </DiarySheet>

        {actionsAbove ? null : actions}
      </div>
    </DiaryPage>
  );
}

function WritingContent({ state, author }: { state: DiarySnapshot; author: DiaryAuthor | null }) {
  const { generation, preparing } = state;
  if (preparing || generation.status === "reading") {
    return <WritingStatus>正在翻开今天的记忆</WritingStatus>;
  }
  if (generation.status === "generating") {
    return (
      <WritingStatus>
        {generation.thinking && author ? `${author.name}思考中` : "正在落笔"}
      </WritingStatus>
    );
  }
  if (generation.status === "saving") {
    return (
      <>
        <div className="diary-body">{generation.entry.body}</div>
        <WritingStatus>正在收进日记本</WritingStatus>
      </>
    );
  }
  if (generation.status === "save-error") {
    return <div className="diary-body">{generation.entry.body}</div>;
  }
  return (
    <p className="diary-writing-placeholder">
      {author
        ? `让 ${author.name} 记下此刻的心情、遇见的人，和还没说出口的话。`
        : "先选一位执笔的人，再翻开今天这一页。"}
    </p>
  );
}

function WritingStatus({ children }: { children: string }) {
  return (
    <p className="diary-writing-status" role="status">
      {children}
      <span className="diary-ellipsis" aria-hidden="true">
        …
      </span>
    </p>
  );
}

function WriteActions({
  diary,
  state,
  author,
  busy,
  onChooseAuthor,
}: {
  diary: DiaryPageProps["diary"];
  state: DiarySnapshot;
  author: DiaryAuthor | null;
  busy: boolean;
  onChooseAuthor: () => void;
}) {
  const { generation, chatId } = state;

  if (generation.status === "save-error") {
    return <SaveErrorActions body={generation.entry.body} onRetry={() => void diary.retrySave()} />;
  }
  if (busy) {
    return (
      <div className="diary-write-actions">
        <Button variant="filled" disabled>
          正在读取资料…
        </Button>
      </div>
    );
  }
  return (
    <div className="diary-write-actions">
      {author ? (
        <Button variant="filled" disabled={!chatId} onClick={() => void diary.generate()}>
          写下这一页
        </Button>
      ) : (
        <Button variant="filled" disabled={!chatId} onClick={onChooseAuthor}>
          选择执笔人
        </Button>
      )}
    </div>
  );
}

function SaveErrorActions({ body, onRetry }: { body: string; onRetry: () => void }) {
  const { message, copy } = useDiaryCopy(body, "已复制正文");
  return (
    <div className="diary-write-actions">
      <p className="diary-save-note">这一页写好了，还差一步收进日记本。</p>
      <div className="diary-write-buttons">
        <Button variant="filled" onClick={onRetry}>
          再收一次
        </Button>
        <Button onClick={() => void copy()}>复制正文</Button>
      </div>
      {message ? (
        <p className="diary-copy-status" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
