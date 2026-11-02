import { readDiaryMoment } from "../diary-time.ts";
import { diaryAuthorKey, type DiaryBook } from "../diary-books.ts";
import { DiaryAvatar, diaryAuthorTone } from "./diary-paper.tsx";

export function DiaryBookCover({
  book,
  running,
  pendingSave,
  currentWriterKey,
  currentWriterName,
}: {
  book: DiaryBook;
  running: boolean;
  pendingSave: boolean;
  currentWriterKey: string | null;
  currentWriterName: string | null;
}) {
  if (book.kind === "all") {
    return (
      <AllBooksCover
        book={book}
        running={running}
        pendingSave={pendingSave}
        currentWriterName={currentWriterName}
      />
    );
  }
  const empty = book.entries.length === 0;
  const latest = book.entries[0] ? readDiaryMoment(book.entries[0].worldTime) : null;
  const latestText = latest
    ? `最近 · ${latest.month} 月 ${latest.day} 日`
    : empty
      ? "等一个值得记住的瞬间"
      : "日期未知";
  const current = currentWriterKey === book.key;
  return (
    <span
      className={`diary-book-cover diary-tone--${diaryAuthorTone(book.name)} ${
        empty ? "diary-book-cover--blank" : ""
      } ${book.unavailable ? "diary-book-cover--stale" : ""}`}
    >
      <span className="diary-book-spine" aria-hidden="true" />
      <span className="diary-book-kicker">DIARY</span>
      <span className="diary-book-mark">
        {empty ? (
          <span className="diary-avatar diary-avatar--large diary-avatar--blank" aria-hidden="true">
            ?
          </span>
        ) : (
          <DiaryAvatar name={book.name} size="large" />
        )}
      </span>
      <span className="diary-book-title">{book.name}的日记</span>
      <span className="diary-book-meta">
        {empty ? "第一页还空着" : `已经收进 ${book.entries.length} 页心事`}
      </span>
      <span className="diary-book-latest">{latestText}</span>
      {book.unavailable ? <span className="diary-book-note">人物已不在当前资料中</span> : null}
      {pendingSave ? (
        <span className="diary-book-flag diary-book-flag--pending">还没收好</span>
      ) : running ? (
        <span className="diary-book-flag diary-book-flag--running">
          <span className="diary-running-ink" aria-hidden="true" />
          正在落笔
        </span>
      ) : current ? (
        <span className="diary-book-flag">当前执笔</span>
      ) : null}
    </span>
  );
}

function AllBooksCover({
  book,
  running,
  pendingSave,
  currentWriterName,
}: {
  book: DiaryBook;
  running: boolean;
  pendingSave: boolean;
  currentWriterName: string | null;
}) {
  const people = new Map<string, string>();
  for (const entry of book.entries) {
    const key = diaryAuthorKey(entry.author);
    if (!people.has(key)) {
      people.set(key, entry.author.name);
    }
  }
  const portraits = [...people].slice(0, 3);
  return (
    <span className="diary-book-cover diary-book-cover--all">
      <span className="diary-book-spine" aria-hidden="true" />
      <span className="diary-book-kicker">EVERYONE</span>
      <span className="diary-book-mark diary-book-mark--all" aria-hidden="true">
        {portraits.length ? (
          <span className="diary-book-people">
            {portraits.map(([key, name]) => (
              <span className="diary-book-person" key={key}>
                <DiaryAvatar name={name} size="small" />
              </span>
            ))}
          </span>
        ) : (
          <span className="diary-book-empty-mark">众</span>
        )}
      </span>
      <span className="diary-book-title">大家的日记</span>
      <span className="diary-book-meta">
        {book.entries.length
          ? `${people.size} 个人写下 ${book.entries.length} 页`
          : "还没有人写下第一页"}
      </span>
      <span className="diary-book-latest">
        {pendingSave
          ? "有一页还没收好"
          : running
            ? `${currentWriterName ?? "有人"}正在落笔`
            : currentWriterName
              ? `以 ${currentWriterName} 执笔`
              : "还没有执笔的人"}
      </span>
    </span>
  );
}
