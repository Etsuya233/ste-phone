import assert from "node:assert/strict";
import test from "node:test";
import { readProfileFields } from "./profile-fields.ts";

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
