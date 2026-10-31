import { useEffect } from "react";
import type { DiarySnapshot } from "../diary.ts";
import { isDiaryRunning } from "../diary.ts";
import { readDiaryMoment } from "../diary-time.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiaryEntryPage } from "./diary-entry-page.tsx";
import { DiaryAvatar, DiarySheet, DiarySheetHeading, useDiaryCopy } from "./diary-paper.tsx";

export function DiaryWritePage(props: DiaryPageProps) {
  const { diary, state, navigation } = props;
  const { generation } = state;
  const writing = isDiaryRunning(generation);
  const busy = state.preparing || writing;
  const author = state.data.author;
  const moment = readDiaryMoment(state.worldTime);
  // 生成和保存失败时把操作放在纸页上方，长正文不会把取消或重试挤出首屏。
  const actionsAbove = writing || generation.status === "save-error";

  useEffect(() => {
    if (navigation.current) void diary.prepare();
  }, [diary, navigation.current]);

  if (generation.status === "complete")
    return (
      <DiaryEntryPage {...props} entry={generation.entry} onWrite={() => void diary.generate()} />
    );

  const actions = (
    <WriteActions
      diary={diary}
      state={state}
      busy={busy}
      writing={writing}
      onChooseAuthor={() => navigation.push({ page: "authors" })}
    />
  );

  return (
    <DiaryPage state={state} title="写日记" onBack={navigation.pop} backLabel="日记本">
      <div className="diary-writer">
        <div className="diary-writer-meta">
          <button
            type="button"
            className="diary-writer-author"
            disabled={busy}
            onClick={() => navigation.push({ page: "authors" })}
          >
            {author ? (
              <DiaryAvatar name={author.name} size="small" />
            ) : (
              <span
                className="diary-avatar diary-avatar--small diary-avatar--blank"
                aria-hidden="true"
              >
                ?
              </span>
            )}
            <span className="diary-writer-author-copy">
              <span className="diary-writer-label">{author ? "执笔" : "还没有执笔人"}</span>
              <span className="diary-writer-name">{author?.name ?? "选择一位"}</span>
            </span>
            <span className="diary-writer-change" aria-hidden="true">
              ›
            </span>
          </button>
          <span className="diary-writer-time">
            {moment?.clock ? `此刻 ${moment.clock}` : "此刻"}
          </span>
        </div>

        {actionsAbove ? actions : null}

        <DiarySheet toneName={author?.name ?? "日记"} className="diary-sheet--writing">
          <DiarySheetHeading worldTime={state.worldTime} />
          <WritingContent state={state} />
        </DiarySheet>

        {actionsAbove ? null : actions}
        {state.notice ? <p className="diary-note">{state.notice}</p> : null}
      </div>
    </DiaryPage>
  );
}

function WritingContent({ state }: { state: DiarySnapshot }) {
  const { generation, preparing, data } = state;
  if (preparing || generation.status === "reading")
    return <WritingStatus>正在翻开今天的记忆</WritingStatus>;
  if (generation.status === "generating")
    return generation.text ? (
      <div className="diary-body diary-body--live">
        {generation.text}
        <span className="diary-caret" aria-hidden="true" />
      </div>
    ) : (
      <WritingStatus>正在落笔</WritingStatus>
    );
  if (generation.status === "saving")
    return (
      <>
        <div className="diary-body">{generation.entry.body}</div>
        <WritingStatus>正在收进日记本</WritingStatus>
      </>
    );
  if (generation.status === "save-error")
    return <div className="diary-body">{generation.entry.body}</div>;
  return (
    <p className="diary-writing-placeholder">
      {data.author
        ? `让 ${data.author.name} 记下此刻的心情、遇见的人，和还没说出口的话。`
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
  busy,
  writing,
  onChooseAuthor,
}: {
  diary: DiaryPageProps["diary"];
  state: DiarySnapshot;
  busy: boolean;
  writing: boolean;
  onChooseAuthor: () => void;
}) {
  const { generation, data, chatId } = state;

  if (generation.status === "save-error")
    return <SaveErrorActions body={generation.entry.body} onRetry={() => void diary.retrySave()} />;
  if (writing)
    return (
      <div className="diary-write-actions">
        <Button
          variant="danger"
          disabled={generation.status === "saving"}
          onClick={() => diary.cancel()}
        >
          {generation.status === "saving" ? "正在收好…" : "停下笔"}
        </Button>
      </div>
    );
  if (busy)
    return (
      <div className="diary-write-actions">
        <Button variant="filled" disabled>
          正在读取资料…
        </Button>
      </div>
    );
  return (
    <div className="diary-write-actions">
      {data.author ? (
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
