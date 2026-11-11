import { useEffect, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { createCampusId, type CampusAccount } from "../campus-domain.ts";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

interface AccountDraft {
  nickname: string;
  avatar: string;
  bio: string;
  style: string;
  privateIdentity: boolean;
  disabled: boolean;
}

export function CampusAccountEditor(props: CampusPageProps & { accountId?: string }) {
  const { service, state, navigation, accountId } = props;
  const account = state.data.accounts.find(({ id }) => id === accountId);
  const priorOwner = account?.owner;
  const person =
    priorOwner?.kind === "person"
      ? state.data.people.find(({ id }) => id === priorOwner.id)
      : undefined;
  const [draft, setDraft] = useState<AccountDraft>(
    () =>
      account ?? {
        nickname: "",
        avatar: "",
        bio: "",
        style: "",
        privateIdentity: false,
        disabled: false,
      },
  );
  const [personProfile, setPersonProfile] = useState(person?.profile ?? "");
  const [personDisabled, setPersonDisabled] = useState(person?.disabled ?? false);
  const [ownership, setOwnership] = useState(
    state.authors.length ? `memory:${state.authors[0]!.id}` : "new-person",
  );
  const [saved, setSaved] = useState(false);
  const newPerson = !account && ownership === "new-person";
  const publicAccount = account ? account.owner.kind === "public" : ownership === "public";
  const valid = Boolean(draft.nickname.trim() && (!(person || newPerson) || personProfile.trim()));
  const busy = saved || state.phase !== "idle";

  useEffect(() => {
    if (saved && navigation.current) {
      navigation.pop();
    }
  }, [saved, navigation]);

  async function save() {
    if (!valid || busy) {
      return;
    }
    const personId = newPerson ? createCampusId() : person?.id;
    let owner: CampusAccount["owner"];
    if (account) {
      owner = account.owner;
    } else if (publicAccount) {
      owner = { kind: "public" };
    } else if (newPerson) {
      owner = { kind: "person", id: personId! };
    } else {
      const separator = ownership.indexOf(":");
      const id = ownership.slice(separator + 1);
      owner = { kind: ownership.startsWith("memory:") ? "memory" : "person", id };
    }
    const next: CampusAccount = {
      id: account?.id ?? createCampusId(),
      owner,
      nickname: draft.nickname.trim(),
      avatar: draft.avatar.trim(),
      bio: draft.bio.trim(),
      style: draft.style.trim(),
      privateIdentity: !publicAccount && draft.privateIdentity,
      disabled: draft.disabled,
      following: account?.following ?? [],
    };
    setSaved(
      await service.command({
        type: "account",
        account: next,
        ...(personId
          ? { person: { id: personId, profile: personProfile.trim(), disabled: personDisabled } }
          : {}),
      }),
    );
  }

  return (
    <CampusPage {...props} title={account ? "编辑账号" : "新建账号"} back={navigation.pop}>
      <form
        className="campus-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {!account ? (
          <OwnershipField state={state} ownership={ownership} onChange={setOwnership} />
        ) : null}
        {person || newPerson ? (
          <label>
            路人人设
            <textarea
              value={personProfile}
              onChange={(event) => setPersonProfile(event.target.value)}
              placeholder="年级、社团、兴趣或说话习惯"
              rows={3}
              required
            />
          </label>
        ) : null}
        <AccountFields
          draft={draft}
          onChange={setDraft}
          publicAccount={publicAccount}
          existing={Boolean(account)}
        />
        {person ? (
          <label>
            <span>
              <input
                type="checkbox"
                checked={personDisabled}
                onChange={(event) => setPersonDisabled(event.target.checked)}
              />{" "}
              停止该路人的所有账号参与新互动
            </span>
          </label>
        ) : null}
        <Button type="submit" variant="filled" disabled={busy || !valid}>
          {account ? "保存资料" : "创建账号"}
        </Button>
      </form>
    </CampusPage>
  );
}

function OwnershipField({
  state,
  ownership,
  onChange,
}: {
  state: CampusPageProps["state"];
  ownership: string;
  onChange: (owner: string) => void;
}) {
  const nameCounts = new Map<string, number>();
  for (const { name } of state.authors) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return (
    <label>
      人物归属
      <select
        aria-label="人物归属"
        value={ownership}
        onChange={(event) => onChange(event.target.value)}
      >
        {state.authors.map(({ id, name }) => (
          <option key={id} value={`memory:${id}`}>
            {(nameCounts.get(name) ?? 0) > 1 ? `${name}（${id}）` : name}
          </option>
        ))}
        {state.data.people
          .filter(({ disabled }) => !disabled)
          .map(({ id, profile }) => (
            <option key={id} value={`person:${id}`}>
              路人 · {profile}
            </option>
          ))}
        <option value="new-person">创建路人</option>
        <option value="public">媒体或公告账号</option>
      </select>
    </label>
  );
}

function AccountFields({
  draft,
  onChange,
  publicAccount,
  existing,
}: {
  draft: AccountDraft;
  onChange: (value: AccountDraft) => void;
  publicAccount: boolean;
  existing: boolean;
}) {
  return (
    <>
      <label>
        昵称
        <input
          value={draft.nickname}
          onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
          required
        />
      </label>
      <label>
        头像地址
        <input
          value={draft.avatar}
          onChange={(event) => onChange({ ...draft, avatar: event.target.value })}
        />
      </label>
      <label>
        公开简介
        <textarea
          value={draft.bio}
          rows={2}
          onChange={(event) => onChange({ ...draft, bio: event.target.value })}
        />
      </label>
      <label>
        发言风格
        <textarea
          value={draft.style}
          rows={2}
          onChange={(event) => onChange({ ...draft, style: event.target.value })}
        />
      </label>
      {!publicAccount ? (
        <label>
          <span>
            <input
              type="checkbox"
              checked={draft.privateIdentity}
              onChange={(event) => onChange({ ...draft, privateIdentity: event.target.checked })}
            />{" "}
            小号，隐藏人物归属
          </span>
        </label>
      ) : null}
      {existing ? (
        <label>
          <span>
            <input
              type="checkbox"
              checked={draft.disabled}
              onChange={(event) => onChange({ ...draft, disabled: event.target.checked })}
            />{" "}
            停用账号，保留历史发言
          </span>
        </label>
      ) : null}
    </>
  );
}
