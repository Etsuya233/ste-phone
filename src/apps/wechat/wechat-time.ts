/** 显示使用设备本地日历，跨天判断不能用固定 24 小时，以免夏令时导致错日。 */
export function formatWechatTime(createdAt: string, now: Date, compact = false): string {
  const date = new Date(createdAt);
  const day = date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const clock = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (day === now.toDateString()) {
    return clock;
  }
  if (day === yesterday.toDateString()) {
    return compact ? "昨天" : `昨天 ${clock}`;
  }
  const calendar = date.toLocaleDateString("zh-CN", {
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    month: "numeric",
    day: "numeric",
  });
  return compact ? calendar : `${calendar} ${clock}`;
}

/** 朋友圈使用相对时间；跨本地日期后回到“昨天/日期”，避免出现“25 小时前”。 */
export function formatWechatMomentTime(createdAt: string, now: Date): string {
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

/** 详情页展示完整日期和时刻，避免相对时间影响回溯。 */
export function formatWechatMomentFullTime(createdAt: string): string {
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

/** 连续消息按相邻发送时刻分组；跨本地日期时即使只隔几秒也显示分隔。 */
export function needsWechatTimeSeparator(createdAt: string, previousAt?: string): boolean {
  if (previousAt === undefined) {
    return true;
  }
  const date = new Date(createdAt);
  const previous = new Date(previousAt);
  return (
    date.toDateString() !== previous.toDateString() || date.getTime() - previous.getTime() > 300000
  );
}
