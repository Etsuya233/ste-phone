import { diaryBookTitle, type DiaryBook } from "../diary-books.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryAvatar, diaryAuthorTone } from "./diary-paper.tsx";

export interface DiaryBookAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

export function DiaryBookHeading({
  book,
  meta,
  action,
}: {
  book: DiaryBook;
  meta: string;
  action: DiaryBookAction | null;
}) {
  return (
    <section
      className={`diary-book-heading ${
        book.kind === "person"
          ? `diary-tone--${diaryAuthorTone(book.name)}`
          : "diary-book-heading--all"
      }`}
      aria-label={diaryBookTitle(book)}
    >
      <div className="diary-book-heading-main">
        {book.kind === "all" ? (
          <span className="diary-book-heading-mark diary-book-heading-mark--all" aria-hidden="true">
            众
          </span>
        ) : (
          <DiaryAvatar name={book.name} size="large" />
        )}
        <div className="diary-book-heading-copy">
          <p className="diary-eyebrow">{book.kind === "all" ? "EVERYONE" : "DIARY"}</p>
          <h2>{diaryBookTitle(book)}</h2>
          <p>{meta}</p>
        </div>
      </div>
      {action ? (
        <Button
          variant="filled"
          className="diary-book-write"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
