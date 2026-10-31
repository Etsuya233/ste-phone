import { useState, type ReactNode } from "react";
import { readDiaryMoment } from "../diary-time.ts";

const TONE_COUNT = 5;

/** 同一人物在封面、列表和日记纸页上使用同一种暖色。 */
export function diaryAuthorTone(name: string): number {
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % TONE_COUNT;
}

export function DiaryAvatar({
  name,
  size = "medium",
}: {
  name: string;
  size?: "small" | "medium" | "large";
}) {
  const initial = Array.from(name.trim())[0] ?? "记";
  return (
    <span
      className={`diary-avatar diary-avatar--${size} diary-tone--${diaryAuthorTone(name)}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function DiarySheet({
  toneName,
  className = "",
  children,
}: {
  toneName: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`diary-sheet diary-tone--${diaryAuthorTone(toneName)} ${className}`}>
      <span className="diary-sheet-tape" aria-hidden="true" />
      {children}
    </article>
  );
}

export function DiarySheetHeading({ worldTime }: { worldTime: string | null }) {
  const moment = readDiaryMoment(worldTime);
  const day = moment ? `${moment.month} 月 ${moment.day} 日` : (worldTime ?? "此刻");
  const caption = moment
    ? [`${moment.year} 年`, moment.weekday, moment.clock].filter(Boolean).join(" · ")
    : "世界时间尚未读取";
  return (
    <header className="diary-sheet-heading">
      <p className="diary-sheet-day">{day}</p>
      <p className="diary-sheet-caption">{caption}</p>
    </header>
  );
}

export function useDiaryCopy(body: string, successMessage = "已复制这一页") {
  const [message, setMessage] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setMessage(successMessage);
    } catch (error) {
      setMessage(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { message, copy };
}
