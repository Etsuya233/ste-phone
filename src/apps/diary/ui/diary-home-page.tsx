import { useState } from "react";
import { isDiaryRunning } from "../diary.ts";
import {
  ALL_DIARY_BOOK_KEY,
  diaryAuthorKey,
  readDiaryBooks,
  sameDiaryAuthor,
  type DiaryBook,
} from "../diary-books.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { DiaryBookCarousel } from "./diary-book-carousel.tsx";
import { DiaryBookPager } from "./diary-book-pager.tsx";
import { DiaryNotices, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryHomePage({ state, navigation, onHome }: DiaryPageProps) {
  const books = readDiaryBooks(state.authors, state.data.entries);
  const [activeKey, setActiveKey] = useState(ALL_DIARY_BOOK_KEY);
  const [alignRequest, setAlignRequest] = useState(0);
  const activeBook = books.find((book) => book.key === activeKey) ?? books[0]!;
  const running = isDiaryRunning(state.generation);
  const runningBookKey = running && state.data.author ? diaryAuthorKey(state.data.author) : null;
  const pendingSaveKey =
    state.generation.status === "save-error" ? diaryAuthorKey(state.generation.entry.author) : null;
  const currentWriter =
    state.data.author &&
    (state.preparing || state.authors.some((author) => sameDiaryAuthor(author, state.data.author!)))
      ? state.data.author
      : null;
  const currentWriterKey = currentWriter ? diaryAuthorKey(currentWriter) : null;

  function showBook(key: string) {
    setActiveKey(key);
    setAlignRequest((value) => value + 1);
  }

  function openBook(book: DiaryBook) {
    showBook(book.key);
    navigation.push({ page: "book", bookKey: book.key });
  }

  return (
    <Page
      className="diary-page diary-home"
      navBar={
        <NavBar
          title="日记"
          back={{ label: "主屏幕", onClick: onHome }}
          right={<Button onClick={() => navigation.push({ page: "settings" })}>设置</Button>}
        />
      }
      footer={<DiaryBookPager books={books} activeKey={activeBook.key} onChange={showBook} />}
      footerHeight={48}
    >
      <div className="diary-home-layout">
        <DiaryNotices state={state} />
        <DiaryBookCarousel
          books={books}
          activeKey={activeBook.key}
          alignRequest={alignRequest}
          runningBookKey={runningBookKey}
          pendingSaveKey={pendingSaveKey}
          currentWriterKey={currentWriterKey}
          currentWriterName={currentWriter?.name ?? null}
          onActiveKeyChange={setActiveKey}
          onOpen={openBook}
        />
      </div>
    </Page>
  );
}
