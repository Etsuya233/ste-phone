import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { diaryBookTitle, type DiaryBook } from "../diary-books.ts";
import { DiaryBookCover } from "./diary-book-cover.tsx";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function findSlide(track: HTMLElement, key: string): HTMLElement | null {
  return (
    [...track.querySelectorAll<HTMLElement>("[data-diary-book]")].find(
      (slide) => slide.dataset.diaryBook === key,
    ) ?? null
  );
}

export function DiaryBookCarousel({
  books,
  activeKey,
  alignRequest,
  runningBookKey,
  pendingSaveKey,
  currentWriterKey,
  currentWriterName,
  onActiveKeyChange,
  onOpen,
}: {
  books: readonly DiaryBook[];
  activeKey: string;
  /** 只有翻页按钮和外部选择会递增；滑动本身不触发回正。 */
  alignRequest: number;
  runningBookKey: string | null;
  pendingSaveKey: string | null;
  currentWriterKey: string | null;
  currentWriterName: string | null;
  onActiveKeyChange: (key: string) => void;
  onOpen: (book: DiaryBook) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const previousAlign = useRef(alignRequest);
  const signature = books.map((book) => book.key).join("\u0000");

  const scrollToKey = useCallback((key: string, behavior: ScrollBehavior) => {
    const element = track.current;
    if (!element || !element.clientWidth) {
      return;
    }
    const slide = findSlide(element, key);
    if (!slide) {
      return;
    }
    element.scrollTo({
      left: slide.offsetLeft - (element.clientWidth - slide.offsetWidth) / 2,
      behavior,
    });
  }, []);

  useLayoutEffect(() => {
    const behavior = alignRequest !== previousAlign.current && !reduceMotion() ? "smooth" : "auto";
    previousAlign.current = alignRequest;
    scrollToKey(activeKeyRef.current, behavior);
  }, [alignRequest, signature, scrollToKey]);

  useEffect(() => {
    const element = track.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => scrollToKey(activeKeyRef.current, "auto"));
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollToKey]);

  useEffect(
    () => () => {
      if (frame.current) {
        cancelAnimationFrame(frame.current);
      }
    },
    [],
  );

  function handleScroll() {
    if (frame.current) {
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const element = track.current;
      if (!element || !element.clientWidth) {
        return;
      }
      const center = element.scrollLeft + element.clientWidth / 2;
      let nearest = activeKeyRef.current;
      let distance = Number.POSITIVE_INFINITY;
      for (const slide of element.querySelectorAll<HTMLElement>("[data-diary-book]")) {
        const delta = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
        if (delta < distance) {
          distance = delta;
          nearest = slide.dataset.diaryBook!;
        }
      }
      if (nearest !== activeKeyRef.current) {
        onActiveKeyChange(nearest);
      }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const index = books.findIndex((book) => book.key === activeKeyRef.current);
    const target = books[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (!target) {
      return;
    }
    event.preventDefault();
    onActiveKeyChange(target.key);
    findSlide(event.currentTarget, target.key)
      ?.querySelector<HTMLElement>(".diary-book-open")
      ?.focus({ preventScroll: true });
    scrollToKey(target.key, reduceMotion() ? "auto" : "smooth");
  }

  return (
    <div
      ref={track}
      className="diary-book-track"
      role="region"
      aria-roledescription="carousel"
      aria-label="日记本"
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      {books.map((book) => {
        const active = book.key === activeKey;
        const count = book.entries.length;
        return (
          <div
            className="diary-book-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={diaryBookTitle(book)}
            data-diary-book={book.key}
            key={book.key}
          >
            <button
              type="button"
              className="diary-book-open"
              tabIndex={active ? 0 : -1}
              aria-current={active ? "true" : undefined}
              aria-label={
                count
                  ? `打开${diaryBookTitle(book)}，${count} 页`
                  : `打开${diaryBookTitle(book)}，还没有内容`
              }
              onClick={() => onOpen(book)}
            >
              <DiaryBookCover
                book={book}
                running={runningBookKey === book.key}
                pendingSave={
                  pendingSaveKey !== null && (book.kind === "all" || pendingSaveKey === book.key)
                }
                currentWriterKey={currentWriterKey}
                currentWriterName={currentWriterName}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
