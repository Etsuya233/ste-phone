import assert from "node:assert/strict";
import test from "node:test";
import { readProfileFields, readProfileSummary } from "./profile-fields.ts";

test("profile fields split labels and keep continuation lines", () => {
  assert.deepEqual(readProfileFields("姓名：甲\n性格：安静\n喜欢靠窗\n近况：在准备考试"), [
    { label: "姓名", value: "甲" },
    { label: "性格", value: "安静\n喜欢靠窗" },
    { label: "近况", value: "在准备考试" },
  ]);
});

test("unlabeled text becomes a single introduction field", () => {
  assert.deepEqual(readProfileFields("第一行\n第二行"), [
    { label: "简介", value: "第一行\n第二行" },
  ]);
  assert.deepEqual(readProfileFields(""), []);
});

test("profile summary prefers personality and skips raw field names", () => {
  const profile = [
    "name: 小蓝",
    "personality: 安静，做事认真。",
    "background: 高二学生",
    "current_status: 正在准备朗读会。",
  ].join("\n");
  assert.equal(readProfileSummary(profile), "安静，做事认真。");
});

test("profile summary falls back to the first readable field or plain prose", () => {
  assert.equal(readProfileSummary("姓名：小红\n背景：文学社成员\n近况：校对稿件。"), "校对稿件。");
  assert.equal(readProfileSummary("只在图书馆见过几次。"), "只在图书馆见过几次。");
  assert.equal(readProfileSummary(""), "");
});
