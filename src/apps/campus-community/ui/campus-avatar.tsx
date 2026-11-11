import { useEffect, useState, type CSSProperties } from "react";
import type { CampusAccount } from "../campus-domain.ts";

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
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [account.avatar]);
  const style = { "--campus-avatar-hue": avatarHue(account.id) } as CSSProperties;
  const className = `campus-avatar campus-avatar--${size}`;
  return account.avatar && !failed ? (
    <img
      className={className}
      src={account.avatar}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={className} style={style} aria-hidden="true">
      {Array.from(account.nickname)[0]}
    </span>
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
