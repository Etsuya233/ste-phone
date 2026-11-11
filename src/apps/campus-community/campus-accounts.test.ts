import assert from "node:assert/strict";
import test from "node:test";
import { createCampusAccounts, publicCampusOwners } from "./campus-accounts.ts";
import { emptyCampus, type CampusAccount } from "./campus-domain.ts";
import { readCampusData } from "./campus-records.ts";

const authors = [
  { id: "a", name: "同名人物" },
  { id: "b", name: "同名人物" },
  { id: "c", name: "另一个人" },
];

test("只为选定人物建原名公开账号，同名身份独立，重复创建不改变数据", () => {
  const first = createCampusAccounts(emptyCampus(), authors, ["a", "b", "a"]);
  assert.equal(first.accounts.length, 2);
  assert.deepEqual(
    first.accounts.map(({ nickname }) => nickname),
    ["同名人物", "同名人物"],
  );
  assert.notEqual(first.accounts[0]!.id, first.accounts[1]!.id);
  assert.equal(first.activeAccountId, first.accounts[0]!.id);
  assert.deepEqual(
    first.accounts.map(({ owner }) => owner),
    [
      { kind: "memory", id: "a" },
      { kind: "memory", id: "b" },
    ],
  );
  assert.deepEqual(readCampusData(first), first);
  assert.equal(createCampusAccounts(first, authors, ["a", "b"]), first);
  assert.throws(() => createCampusAccounts(first, authors, ["missing"]), /当前资料/);
  assert.throws(() => createCampusAccounts(first, authors, []), /当前资料/);
});

test("停用公开账号仍占位，只有小号时补建，保留现有账号及操作身份", () => {
  const base = createCampusAccounts(emptyCampus(), authors, ["a", "b"]);
  base.accounts[0]!.disabled = true;
  const alt = base.accounts[1]!;
  alt.privateIdentity = true;
  alt.nickname = "自定义小号";
  alt.following = [base.accounts[0]!.id];
  base.activeAccountId = alt.id;
  const before = structuredClone(base);
  assert.deepEqual([...publicCampusOwners(base.accounts)], ["a"]);
  const next = createCampusAccounts(base, authors, ["a", "b"]);
  assert.deepEqual(base, before);
  assert.deepEqual(next.accounts.slice(0, 2), before.accounts);
  assert.equal(next.activeAccountId, alt.id);
  const created: CampusAccount = next.accounts[2]!;
  assert.deepEqual(created, {
    id: created.id,
    owner: { kind: "memory", id: "b" },
    nickname: "同名人物",
    avatar: "",
    bio: "",
    style: "",
    following: [],
    disabled: false,
    privateIdentity: false,
  });
  assert.equal(next.posts, base.posts);
  assert.equal(next.people, base.people);
});
