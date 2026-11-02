import type { DiaryAuthor, DiaryEntry } from "./diary.ts";

export const ALL_DIARY_BOOK_KEY = "all";

/** 保存进条目的作者快照，不包含生成时才需要的资料正文。 */
export interface DiaryBookAuthor {
  readonly id: string;
  readonly name: string;
  readonly sourceId: string;
  readonly scopeId: string;
}

export interface DiaryBook {
  readonly key: string;
  readonly kind: "all" | "person";
  readonly name: string;
  readonly author: DiaryBookAuthor | null;
  readonly entries: readonly DiaryEntry[];
  /** 人物已不在当前资料中：旧日记仍可读，但不能继续写。 */
  readonly unavailable: boolean;
}

/** 同一人物在不同实例中 id 会变化，稳定空间与来源也必须一起比较。 */
export function diaryAuthorKey(author: DiaryBookAuthor | DiaryAuthor): string {
  return JSON.stringify([author.scopeId, author.sourceId, author.id]);
}

export function sameDiaryAuthor(
  left: DiaryBookAuthor | DiaryAuthor | null | undefined,
  right: DiaryBookAuthor | DiaryAuthor | null | undefined,
): boolean {
  return Boolean(left && right && diaryAuthorKey(left) === diaryAuthorKey(right));
}

export function diaryBookTitle(book: DiaryBook): string {
  return book.kind === "all" ? "大家的日记" : `${book.name}的日记`;
}

/** 书单按每本书最后一条日记的实际写入时间倒序；没写过的书按姓名和稳定 id 排在后面。 */
export function readDiaryBooks(
  authors: readonly DiaryAuthor[],
  entries: readonly DiaryEntry[],
): DiaryBook[] {
  const grouped = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    const key = diaryAuthorKey(entry.author);
    const book = grouped.get(key);
    if (book) {
      book.push(entry);
    } else {
      grouped.set(key, [entry]);
    }
  }
  for (const [key, bookEntries] of grouped) {
    grouped.set(key, sortEntries(bookEntries));
  }

  const personBooks: DiaryBook[] = [];
  const known = new Set<string>();
  for (const author of authors) {
    const key = diaryAuthorKey(author);
    if (known.has(key)) {
      continue;
    }
    known.add(key);
    personBooks.push({
      key,
      kind: "person",
      name: author.name,
      author,
      entries: grouped.get(key) ?? [],
      unavailable: false,
    });
  }

  for (const [key, bookEntries] of grouped) {
    if (known.has(key)) {
      continue;
    }
    known.add(key);
    const author = bookEntries[0]!.author;
    personBooks.push({
      key,
      kind: "person",
      name: author.name,
      author,
      entries: bookEntries,
      unavailable: true,
    });
  }

  const written = personBooks.filter((book) => book.entries.length > 0);
  const blank = personBooks.filter((book) => book.entries.length === 0);
  written.sort(
    (left, right) =>
      right.entries[0]!.createdAt.localeCompare(left.entries[0]!.createdAt) ||
      left.name.localeCompare(right.name, "zh-Hans-CN") ||
      left.key.localeCompare(right.key),
  );
  blank.sort(
    (left, right) =>
      left.name.localeCompare(right.name, "zh-Hans-CN") || left.key.localeCompare(right.key),
  );

  return [
    {
      key: ALL_DIARY_BOOK_KEY,
      kind: "all",
      name: "大家的日记",
      author: null,
      entries: sortEntries(entries),
      unavailable: false,
    },
    ...written,
    ...blank,
  ];
}

/** createdAt 是实际写入时生成的 UTC ISO 字符串，可直接按字典序比较；相同时间保持原有顺序。 */
function sortEntries(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
