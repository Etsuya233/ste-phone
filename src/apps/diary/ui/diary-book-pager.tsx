import { diaryBookTitle, type DiaryBook } from "../diary-books.ts";

export function DiaryBookPager({
  books,
  activeKey,
  onChange,
}: {
  books: readonly DiaryBook[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  const found = books.findIndex((book) => book.key === activeKey);
  const index = found < 0 ? 0 : found;
  const previous = books[index - 1];
  const next = books[index + 1];

  return (
    <div className="diary-book-pager">
      <button
        type="button"
        className="diary-book-page-arrow"
        aria-label="上一本日记"
        disabled={!previous}
        onClick={() => previous && onChange(previous.key)}
      >
        ‹
      </button>
      {books.length <= 8 ? (
        <div className="diary-book-dots">
          {books.map((book, dotIndex) => (
            <button
              type="button"
              key={book.key}
              className={`diary-book-dot${dotIndex === index ? " diary-book-dot--active" : ""}`}
              aria-label={diaryBookTitle(book)}
              aria-current={dotIndex === index ? "true" : undefined}
              onClick={() => onChange(book.key)}
            />
          ))}
        </div>
      ) : (
        <span className="diary-book-count" aria-live="polite">
          {index + 1} / {books.length}
        </span>
      )}
      <button
        type="button"
        className="diary-book-page-arrow"
        aria-label="下一本日记"
        disabled={!next}
        onClick={() => next && onChange(next.key)}
      >
        ›
      </button>
    </div>
  );
}
