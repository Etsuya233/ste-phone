import assert from "node:assert/strict";
import test from "node:test";
import { formatWrittenAt, readDiaryMoment } from "./diary-time.ts";

test("日记世界时间按字面日期读取，并给出星期与时钟", () => {
  assert.deepEqual(readDiaryMoment("2026-10-31 23:00:00"), {
    year: 2026,
    month: 10,
    day: 31,
    weekday: "星期六",
    clock: "23:00",
  });
  assert.deepEqual(readDiaryMoment("2026-10-30T16:45:00+08:00"), {
    year: 2026,
    month: 10,
    day: 30,
    weekday: "星期五",
    clock: "16:45",
  });
});

test("只有日期或无效时间时保留可读部分", () => {
  assert.equal(readDiaryMoment("2026-02-29"), null);
  assert.equal(readDiaryMoment("2026-10-31 25:00")?.clock, null);
  assert.equal(readDiaryMoment("某年某月"), null);
  assert.equal(readDiaryMoment(null), null);
});

test("实际落笔时间按设备时区显示", () => {
  const localTime = new Date(2026, 9, 31, 14, 5).toISOString();
  assert.equal(formatWrittenAt(localTime), "写于 10 月 31 日 14:05");
});
