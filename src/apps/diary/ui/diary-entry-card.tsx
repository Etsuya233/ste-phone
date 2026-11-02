import type { DiaryEntry } from "../diary.ts";
import type { DiaryBook } from "../diary-books.ts";
import { readDiaryMoment } from "../diary-time.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryAvatar } from "./diary-paper.tsx";

export function DiaryEntryCard({
  entry,
  showAuthor,
  onOpen,
}: {
  entry: DiaryEntry;
  showAuthor: boolean;
  onOpen: () => void;
}) {
  const moment = readDiaryMoment(entry.worldTime);
  return (
    <button type="button" className="diary-entry" onClick={onOpen}>
      <span className="diary-entry-date">
        <strong>{moment ? String(moment.day).padStart(2, "0") : "—"}</strong>
        <span>{moment ? `${moment.month} 月` : "日期未知"}</span>
      </span>
      <span className="diary-entry-main">
        {showAuthor ? (
          <span className="diary-entry-meta">
            <DiaryAvatar name={entry.author.name} size="small" />
            <span className="diary-entry-author">{entry.author.name}</span>
            {moment ? <span className="diary-entry-weekday">{moment.weekday}</span> : null}
          </span>
        ) : null}
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

export function EmptyDiaryBook({
  book,
  actionLabel,
  disabled,
  onStart,
}: {
  book: DiaryBook;
  actionLabel: string;
  disabled: boolean;
  onStart: () => void;
}) {
  const all = book.kind === "all";
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
      <p className="diary-empty-title">{all ? "还没有人写下第一页" : "日记本还是空白的"}</p>
      <p className="diary-empty-copy">
        {all
          ? "从属于某个人的一本日记开始，让大家的故事慢慢聚到一起。"
          : `等一个值得记住的瞬间，让 ${book.name} 写下第一页。`}
      </p>
      <Button variant="filled" disabled={disabled} onClick={onStart}>
        {actionLabel}
      </Button>
    </div>
  );
}
