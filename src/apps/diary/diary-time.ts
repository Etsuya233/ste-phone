const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;
const WORLD_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

export interface DiaryMoment {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: string;
  readonly clock: string | null;
}

/**
 * 世界时间来自 Memory，常见形式是 `2026-10-31 23:00:00` 或 ISO 时间。
 * 只按字面日期读取，避免本地时区把剧情日期推到前一天或后一天。
 */
export function readDiaryMoment(worldTime: string | null | undefined): DiaryMoment | null {
  if (!worldTime) return null;
  const matched = WORLD_TIME.exec(worldTime);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  const hour = matched[4] === undefined ? null : Number(matched[4]);
  const minute = matched[5] === undefined ? null : Number(matched[5]);
  const clock =
    hour !== null && minute !== null && hour < 24 && minute < 60
      ? `${matched[4]}:${matched[5]}`
      : null;
  return { year, month, day, weekday: WEEKDAYS[date.getUTCDay()]!, clock };
}

/** 实际落笔时间使用设备时区，和剧情世界时间分开显示。 */
export function formatWrittenAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `写于 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
