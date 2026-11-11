import type { CampusAuthor } from "./campus-context.ts";
import { createCampusId, type CampusAccount, type CampusData } from "./campus-domain.ts";

export function publicCampusOwners(accounts: readonly CampusAccount[]): Set<string> {
  // 停用也代表用户已有公开账号，批量创建不能绕过停用设置。
  return new Set(
    accounts.flatMap(({ owner, privateIdentity }) =>
      owner.kind === "memory" && !privateIdentity ? [owner.id] : [],
    ),
  );
}

export function createCampusAccounts(
  data: CampusData,
  authors: readonly CampusAuthor[],
  authorIds: readonly string[],
): CampusData {
  const selected = new Set(authorIds);
  const available = new Set(authors.map(({ id }) => id));
  if (!selected.size || [...selected].some((id) => !available.has(id))) {
    throw new Error("请选择当前资料中的人物");
  }
  const existing = publicCampusOwners(data.accounts);
  const accounts: CampusAccount[] = authors
    .filter(({ id }) => selected.has(id) && !existing.has(id))
    .map(({ id, name }) => ({
      id: createCampusId(),
      owner: { kind: "memory", id },
      nickname: name,
      avatar: "",
      bio: "",
      style: "",
      following: [],
      disabled: false,
      privateIdentity: false,
    }));
  if (!accounts.length) {
    return data;
  }
  return {
    ...data,
    accounts: [...data.accounts, ...accounts],
    activeAccountId: data.activeAccountId ?? accounts[0]!.id,
  };
}
