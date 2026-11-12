import { createContext, useContext, type CSSProperties } from "react";
import { ProfileAvatar } from "../../../frontend/images/profile-avatar.tsx";
import type { CampusAuthor } from "../campus-context.ts";
import type { CampusAccount } from "../campus-domain.ts";

export const CampusCharacterAvatars = createContext<readonly CampusAuthor[]>([]);

/** 无头像时使用稳定色相，避免同名账号在信息流里完全一样。 */
function avatarHue(id: string): number {
  let value = 0;
  for (const character of id) {
    value = (value * 31 + character.codePointAt(0)!) % 360;
  }
  return value;
}

export function AccountAvatar({
  account,
  size = "normal",
}: {
  account: CampusAccount;
  size?: "small" | "normal" | "large";
}) {
  const people = useContext(CampusCharacterAvatars);
  const { owner } = account;
  const customPath = typeof account.avatar === "string" ? account.avatar : account.avatar.imagePath;
  const path =
    customPath ||
    (owner.kind === "memory"
      ? people.find(({ id }) => id === owner.id)?.avatar?.imagePath
      : undefined);
  const style = { "--campus-avatar-hue": avatarHue(account.id) } as CSSProperties;
  const className = `campus-avatar campus-avatar--${size}`;
  return (
    <ProfileAvatar className={className} path={path} style={style}>
      {Array.from(account.nickname)[0]}
    </ProfileAvatar>
  );
}

export function AccountName({ account, onClick }: { account: CampusAccount; onClick: () => void }) {
  return (
    <button type="button" className="campus-account-name" onClick={onClick}>
      {account.nickname}
    </button>
  );
}

export function AccountLink({ account, onClick }: { account: CampusAccount; onClick: () => void }) {
  return (
    <button type="button" className="campus-account" onClick={onClick}>
      <AccountAvatar account={account} />
      <span>{account.nickname}</span>
    </button>
  );
}
