/** 信息流使用相对时间；跨本地日期后回到“昨天/日期”，避免出现“25 小时前”。 */
export function formatCampusTime(createdAt: number, now: Date): string {
  const date = new Date(createdAt);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 60000) {
    return "刚刚";
  }
  if (elapsed < 3600000) {
    return `${Math.floor(elapsed / 60000)} 分钟前`;
  }
  if (date.toDateString() === now.toDateString()) {
    return `${Math.floor(elapsed / 3600000)} 小时前`;
  }
  const clock = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${clock}`;
  }
  return date.toLocaleDateString("zh-CN", {
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    month: "numeric",
    day: "numeric",
  });
}

/** 详情与无障碍名称保留完整日期，避免相对时间影响回溯。 */
export function formatCampusFullTime(createdAt: number): string {
  const date = new Date(createdAt);
  const calendar = date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const clock = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${calendar} ${clock}`;
}

/** 卡片使用紧凑计数，详情与无障碍标签继续展示精确数字。 */
export function formatCampusCount(value: number): string {
  if (value < 10000) {
    return value.toLocaleString("zh-CN");
  }
  const compact = (Math.floor(value / 1000) / 10).toFixed(1).replace(/\.0$/, "");
  return `${compact}万`;
}
