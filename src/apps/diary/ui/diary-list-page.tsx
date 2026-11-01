import type { DiaryEntry } from "../diary.ts";
import { isDiaryRunning } from "../diary.ts";
import { readDiaryMoment } from "../diary-time.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryAvatar } from "./diary-paper.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryListPage({ diary, state, navigation, onHome }: DiaryPageProps) {
  const author = state.data.author;
  const running = isDiaryRunning(state.generation);
  const busy = state.preparing || running;
  const entryCount = state.data.entries.length;

  function openWriter() {
    diary.startWriting();
    navigation.push({ page: "write" });
  }
  function openAuthors() {
    navigation.push({ page: "authors" });
  }
  function startFromEmpty() {
    if (author) {
      openWriter();
    } else {
      openAuthors();
    }
  }

  return (
    <DiaryPage state={state} title="日记本" onBack={onHome} backLabel="主屏幕">
      <section className="diary-cover" aria-label="当前日记本">
        <p className="diary-cover-kicker">DIARY</p>
        <div className="diary-cover-heading">
          {author ? (
            <DiaryAvatar name={author.name} size="large" />
          ) : (
            <span
              className="diary-avatar diary-avatar--large diary-avatar--blank"
              aria-hidden="true"
            >
              ?
            </span>
          )}
          <div className="diary-cover-copy">
            <p className="diary-cover-title">
              {author ? `${author.name}的日记` : "一本空白的日记"}
            </p>
            <p className="diary-cover-meta">
              {author
                ? entryCount
                  ? `已经收进 ${entryCount} 页心事。`
                  : "第一页还空着，等一个值得记住的瞬间。"
                : "先选一位人物，让 TA 用自己的口吻记下这个世界。"}
            </p>
          </div>
        </div>
        <Button
          variant="filled"
          className="diary-cover-write"
          disabled={!state.chatId}
          onClick={author ? openWriter : openAuthors}
        >
          {author ? (running ? "看看写到哪儿了" : "写一篇") : "选择执笔人"}
        </Button>
        <div className="diary-cover-footer">
          {author ? (
            <button
              type="button"
              className="diary-cover-link"
              disabled={!state.chatId || busy}
              onClick={openAuthors}
            >
              由 {author.name} 执笔 · 换一位
            </button>
          ) : null}
          <button
            type="button"
            className="diary-cover-link diary-cover-link--end"
            disabled={!state.chatId || busy}
            onClick={() => navigation.push({ page: "settings" })}
          >
            写作设置
          </button>
        </div>
      </section>

      {running ? (
        <button type="button" className="diary-running" onClick={openWriter}>
          <span className="diary-running-ink" aria-hidden="true" />
          <span className="diary-running-copy">
            <span className="diary-running-title">
              {state.generation.status === "saving" ? "正在收好这一页…" : "正在落笔…"}
            </span>
            <span className="diary-running-sub">点开看看写到哪儿了</span>
          </span>
          <span className="diary-running-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      ) : null}

      <section className="diary-entries" aria-labelledby="diary-entries-title">
        <div className="diary-section-heading">
          <h2 id="diary-entries-title">翻翻从前</h2>
          {entryCount ? <span>{entryCount} 页</span> : null}
        </div>
        {entryCount ? (
          <div className="diary-entry-list">
            {state.data.entries.map((entry) => (
              <DiaryEntryCard
                key={entry.id}
                entry={entry}
                onOpen={() => navigation.push({ page: "detail", id: entry.id })}
              />
            ))}
          </div>
        ) : (
          <EmptyDiary
            authorName={author?.name ?? null}
            disabled={!state.chatId}
            onStart={startFromEmpty}
          />
        )}
      </section>
    </DiaryPage>
  );
}

function DiaryEntryCard({ entry, onOpen }: { entry: DiaryEntry; onOpen: () => void }) {
  const moment = readDiaryMoment(entry.worldTime);
  return (
    <button type="button" className="diary-entry" onClick={onOpen}>
      <span className="diary-entry-date">
        <strong>{moment ? String(moment.day).padStart(2, "0") : "—"}</strong>
        <span>{moment ? `${moment.month} 月` : "日期未知"}</span>
      </span>
      <span className="diary-entry-main">
        <span className="diary-entry-meta">
          <DiaryAvatar name={entry.author.name} size="small" />
          <span className="diary-entry-author">{entry.author.name}</span>
          {moment ? <span className="diary-entry-weekday">{moment.weekday}</span> : null}
        </span>
        <span className="diary-entry-excerpt">{entry.body}</span>
        <span className="diary-entry-foot">
          {moment
            ? [moment.year + " 年", moment.clock].filter(Boolean).join(" · ")
            : entry.worldTime}
        </span>
      </span>
    </button>
  );
}

function EmptyDiary({
  authorName,
  disabled,
  onStart,
}: {
  authorName: string | null;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <div className="diary-empty">
      <svg className="diary-empty-art" viewBox="0 0 120 88" aria-hidden="true">
        <path d="M12 18c14-6 30-6 46 2v56c-16-8-32-8-46-2z" />
        <path d="M108 18c-14-6-30-6-46 2v56c16-8 32-8 46-2z" />
        <path d="M60 20v56M26 32c8-2 16-1 24 3M26 44c8-2 16-1 24 3M70 35c8-4 16-5 24-3M70 47c8-4 16-5 24-3" />
        <path
          className="diary-empty-heart"
          d="M86 15c0-3 4-5 6-2 2-3 6-1 6 2 0 4-6 7-6 7s-6-3-6-7z"
        />
      </svg>
      <p className="diary-empty-title">日记本还是空白的</p>
      <p className="diary-empty-copy">
        {authorName
          ? `等一个值得记住的瞬间，让 ${authorName} 写下第一页。`
          : "先选一位执笔的人，让这个世界有人替你记得。"}
      </p>
      <Button variant="filled" disabled={disabled} onClick={onStart}>
        {authorName ? "写下第一页" : "选择执笔人"}
      </Button>
    </div>
  );
}
