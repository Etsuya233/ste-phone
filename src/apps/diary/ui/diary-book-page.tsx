import { useState } from "react";
import type { DiaryAuthor, DiarySnapshot } from "../diary.ts";
import { isDiaryRunning, type DiaryGeneration } from "../diary.ts";
import { diaryAuthorKey, readDiaryBooks, sameDiaryAuthor, type DiaryBook } from "../diary-books.ts";
import type { DiaryRoute } from "./diary-page.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { DiaryBookHeading, type DiaryBookAction } from "./diary-book-heading.tsx";
import { DiaryEntryCard, EmptyDiaryBook } from "./diary-entry-card.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryBookPage({
  diary,
  state,
  navigation,
  bookKey,
}: DiaryPageProps & { bookKey: string }) {
  const books = readDiaryBooks(state.authors, state.data.entries);
  const book = books.find((candidate) => candidate.key === bookKey);

  if (!book) {
    return (
      <DiaryPage state={state} title="日记" onBack={navigation.pop} backLabel="日记本">
        <p className="diary-missing">这本书已经不在日记本里了。</p>
      </DiaryPage>
    );
  }

  return <DiaryBookView diary={diary} state={state} navigation={navigation} book={book} />;
}

function DiaryBookView({
  diary,
  state,
  navigation,
  book,
}: {
  diary: DiaryPageProps["diary"];
  state: DiarySnapshot;
  navigation: Navigation<DiaryRoute>;
  book: DiaryBook;
}) {
  const count = book.entries.length;
  const people = new Set(book.entries.map((entry) => diaryAuthorKey(entry.author))).size;
  const savedAuthor = state.data.author;
  const currentAuthor =
    savedAuthor &&
    (state.preparing || state.authors.some((author) => sameDiaryAuthor(author, savedAuthor)))
      ? savedAuthor
      : null;
  const running = isDiaryRunning(state.generation);
  const runningKey = savedAuthor ? diaryAuthorKey(savedAuthor) : null;
  const runningHere = running && runningKey === book.key;
  const pendingSaveAuthor =
    state.generation.status === "save-error" ? state.generation.entry.author : null;
  const saveErrorHere =
    Boolean(pendingSaveAuthor) &&
    (book.kind === "all" || diaryAuthorKey(pendingSaveAuthor!) === book.key);
  const blockedBySave = Boolean(
    pendingSaveAuthor && book.kind === "person" && diaryAuthorKey(pendingSaveAuthor) !== book.key,
  );
  const showRunning = runningHere || (running && book.kind === "all") || saveErrorHere;
  const blocked = (running && !showRunning) || blockedBySave;
  const { error, busy, write } = useBookWriting({ diary, state, navigation, book, currentAuthor });

  const action = readBookAction({
    book,
    count,
    currentAuthor,
    savedAuthorName: savedAuthor?.name ?? null,
    pendingSaveName: pendingSaveAuthor?.name ?? null,
    busy,
    blocked,
    blockedBySave,
    showRunning,
    write,
  });

  return (
    <DiaryPage state={state} title="日记" onBack={navigation.pop} backLabel="日记本" error={error}>
      <DiaryBookHeading
        book={book}
        meta={readBookMeta(book, count, people, state.preparing)}
        action={action}
      />
      {showRunning ? (
        <RunningStrip
          title={readRunningTitle(state.generation, savedAuthor?.name ?? null, book.kind)}
          sub={state.generation.status === "save-error" ? "点开重新收好" : "点开看看写到哪儿了"}
          onClick={() => navigation.push({ page: "write" })}
        />
      ) : null}
      {blocked ? (
        <p className="diary-message">
          {blockedBySave
            ? `${pendingSaveAuthor?.name ?? "有人"}的这一页还没收好，先去那本日记里收好，再写新的。`
            : `${savedAuthor?.name ?? "其他人"}正在写另一本日记，稍后再来。`}
        </p>
      ) : null}
      <section className="diary-entries" aria-labelledby="diary-entries-title">
        <div className="diary-section-heading">
          <h2 id="diary-entries-title">{book.kind === "all" ? "所有页面" : "翻翻从前"}</h2>
          {count ? <span>{count} 页</span> : null}
        </div>
        {count ? (
          <div className="diary-entry-list">
            {book.entries.map((entry) => (
              <DiaryEntryCard
                key={entry.id}
                entry={entry}
                showAuthor={book.kind === "all"}
                onOpen={() =>
                  navigation.push({ page: "detail", id: entry.id, fromBookKey: book.key })
                }
              />
            ))}
          </div>
        ) : (
          <EmptyDiaryBook
            book={book}
            actionLabel={readEmptyLabel(book, currentAuthor)}
            disabled={busy || running || blocked || book.unavailable}
            onStart={() => void write()}
          />
        )}
      </section>
    </DiaryPage>
  );
}

/** 写作动作只在这个 Hook 里改动执笔人，页面只负责展示阻断原因。 */
function useBookWriting({
  diary,
  state,
  navigation,
  book,
  currentAuthor,
}: {
  diary: DiaryPageProps["diary"];
  state: DiarySnapshot;
  navigation: Navigation<DiaryRoute>;
  book: DiaryBook;
  currentAuthor: DiaryAuthor | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const busy = state.preparing || selecting || !state.chatId;

  async function write() {
    setError(null);
    if (book.kind === "all") {
      if (!currentAuthor) {
        navigation.push({ page: "authors" });
        return;
      }
      diary.startWriting();
      navigation.push({ page: "write" });
      return;
    }
    setSelecting(true);
    try {
      if (!sameDiaryAuthor(state.data.author, book.author)) {
        await diary.selectAuthor(book.author!.id);
      }
      diary.startWriting();
      navigation.push({ page: "write" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSelecting(false);
    }
  }

  return { error, busy, write };
}

function readBookAction({
  book,
  count,
  currentAuthor,
  savedAuthorName,
  pendingSaveName,
  busy,
  blocked,
  blockedBySave,
  showRunning,
  write,
}: {
  book: DiaryBook;
  count: number;
  currentAuthor: DiaryAuthor | null;
  savedAuthorName: string | null;
  pendingSaveName: string | null;
  busy: boolean;
  blocked: boolean;
  blockedBySave: boolean;
  showRunning: boolean;
  write: () => Promise<void>;
}): DiaryBookAction | null {
  if (book.unavailable || showRunning || count === 0) {
    return null;
  }
  if (book.kind === "all") {
    return {
      label: currentAuthor ? `以 ${currentAuthor.name} 的身份写一篇` : "选择执笔人",
      disabled: busy,
      onClick: () => void write(),
    };
  }
  if (blocked) {
    return {
      label: blockedBySave
        ? `先收好 ${pendingSaveName ?? "有人"} 的一页`
        : `${savedAuthorName ?? "其他人"}正在写…`,
      disabled: true,
      onClick: () => {},
    };
  }
  return { label: "写一篇", disabled: busy, onClick: () => void write() };
}

function readBookMeta(book: DiaryBook, count: number, people: number, preparing: boolean): string {
  if (book.kind === "all") {
    return count ? `${count} 页 · ${people} 个人写过` : "还没有人写下第一页";
  }
  if (preparing) {
    return "正在读取人物…";
  }
  if (book.unavailable) {
    return "这位人物已不在当前资料中，旧日记仍可阅读";
  }
  return count ? `已经收进 ${count} 页心事` : "第一页还空着";
}

function readEmptyLabel(book: DiaryBook, currentAuthor: DiaryAuthor | null): string {
  if (book.kind === "person") {
    return "写下第一页";
  }
  return currentAuthor ? `以 ${currentAuthor.name} 的身份写一篇` : "选择执笔人";
}

function readRunningTitle(
  generation: DiaryGeneration,
  name: string | null,
  kind: DiaryBook["kind"],
): string {
  if (generation.status === "save-error") {
    return "这一页还没收好";
  }
  if (generation.status === "saving") {
    return "正在收好这一页…";
  }
  if (generation.status === "generating" && generation.thinking && name) {
    return `${name}思考中…`;
  }
  return kind === "all" && name ? `${name}正在落笔…` : "正在落笔…";
}

function RunningStrip({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="diary-running" onClick={onClick}>
      <span className="diary-running-ink" aria-hidden="true" />
      <span className="diary-running-copy">
        <span className="diary-running-title">{title}</span>
        <span className="diary-running-sub">{sub}</span>
      </span>
      <span className="diary-running-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
