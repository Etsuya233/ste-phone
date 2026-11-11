import assert from "node:assert/strict";
import test from "node:test";
import { formatCampusCount, formatCampusFullTime, formatCampusTime } from "./campus-display.ts";

const now = new Date("2026-11-11T12:00:00+08:00");

test("信息流时间按本地日历跨天，详情保留完整日期", () => {
  assert.equal(formatCampusTime(now.getTime() - 30000, now), "刚刚");
  assert.equal(formatCampusTime(now.getTime() - 5 * 60000, now), "5 分钟前");
  assert.equal(formatCampusTime(now.getTime() - 3 * 3600000, now), "3 小时前");
  assert.equal(
    formatCampusTime(new Date("2026-11-10T18:30:00+08:00").getTime(), now),
    "昨天 18:30",
  );
  assert.equal(formatCampusTime(new Date("2026-11-01T08:05:00+08:00").getTime(), now), "11/1");
  assert.equal(
    formatCampusFullTime(new Date("2026-11-10T18:30:00+08:00").getTime()),
    "2026/11/10 18:30",
  );
});

test("计数超过一万时使用一位小数的万，不足一万保留完整数字", () => {
  assert.equal(formatCampusCount(999), "999");
  assert.equal(formatCampusCount(10000), "1万");
  assert.equal(formatCampusCount(12345), "1.2万");
  assert.equal(formatCampusCount(99999), "9.9万");
});
