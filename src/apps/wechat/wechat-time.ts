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
