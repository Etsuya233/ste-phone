import type { ImageRecord } from "../../core/image-hub/public.ts";

const GROUPS = [
  { key: "today", title: "今天" },
  { key: "yesterday", title: "昨天" },
  { key: "earlier", title: "更早" },
] as const;

export type GalleryGroupKey = (typeof GROUPS)[number]["key"];

export interface GalleryImageGroup {
  readonly key: GalleryGroupKey;
  readonly title: string;
  readonly images: readonly ImageRecord[];
}

/**
 * 按设备本地日历归组。昨天用日历日期减一天，避免夏令时切换时出现 23 或 25 小时的误差。
 * 组内保持输入顺序；无效的 savedAt 无法落到今天或昨天，归入「更早」。
 */
export function groupImagesBySavedAt(
  images: readonly ImageRecord[],
  now: Date,
): readonly GalleryImageGroup[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const buckets: Record<GalleryGroupKey, ImageRecord[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const image of images) {
    const savedAt = new Date(image.savedAt).getTime();
    const key =
      savedAt >= todayStart ? "today" : savedAt >= yesterdayStart ? "yesterday" : "earlier";
    buckets[key].push(image);
  }
  return GROUPS.flatMap((group) =>
    buckets[group.key].length > 0
      ? [{ key: group.key, title: group.title, images: buckets[group.key] }]
      : [],
  );
}
