import { useEffect, useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { createCampusId, type CampusAccount } from "../campus-domain.ts";
import { AccountAvatar } from "./campus-avatar.tsx";
import { CampusAvatarPicker } from "./campus-avatar-picker.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

interface AccountDraft {
  nickname: string;
  avatar: CampusAccount["avatar"];
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
  const [initialOwnership] = useState(() =>
    state.authors.length ? `memory:${state.authors[0]!.id}` : "new-person",
  );
  const [ownership, setOwnership] = useState(initialOwnership);
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const newPerson = !account && ownership === "new-person";
  const publicAccount = account ? account.owner.kind === "public" : ownership === "public";
  const valid = Boolean(draft.nickname.trim() && (!(person || newPerson) || personProfile.trim()));
  const busy = saved || state.phase !== "idle";
  const initial = account ?? {
    nickname: "",
    avatar: "",
    bio: "",
    style: "",
    privateIdentity: false,
    disabled: false,
  };
  const dirty =
    draft.nickname !== initial.nickname ||
    draft.avatar !== initial.avatar ||
    draft.bio !== initial.bio ||
    draft.style !== initial.style ||
    draft.privateIdentity !== initial.privateIdentity ||
    draft.disabled !== initial.disabled ||
    personProfile !== (person?.profile ?? "") ||
    personDisabled !== (person?.disabled ?? false) ||
    (!account && ownership !== initialOwnership);

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
      avatar: draft.avatar,
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

  function back() {
    if (saved) {
      navigation.pop();
      return;
    }
    if (dirty) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }

  return (
    <>
      <div inert={discard}>
        <CampusPage {...props} title={account ? "编辑账号" : "新建账号"} back={back}>
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
              onPickAvatar={() => setAvatarPicker(true)}
            />
            {avatarPicker ? (
              <CampusAvatarPicker
                active={navigation.current}
                selected={draft.avatar}
                onSelect={(avatar) => {
                  setDraft({ ...draft, avatar });
                  setAvatarPicker(false);
                }}
                onClose={() => setAvatarPicker(false)}
              />
            ) : null}
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
      </div>
      {discard ? (
        <Alert
          title="舍弃账号修改？"
          active={navigation.current}
          onDismiss={() => setDiscard(false)}
          actions={[
            { label: "继续编辑", onClick: () => setDiscard(false) },
            {
              label: "舍弃",
              primary: true,
              onClick: () => {
                setDiscard(false);
                navigation.pop();
              },
            },
          ]}
        >
          尚未保存的账号资料会丢失。
        </Alert>
      ) : null}
    </>
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
  onPickAvatar,
}: {
  draft: AccountDraft;
  onChange: (value: AccountDraft) => void;
  publicAccount: boolean;
  existing: boolean;
  onPickAvatar: () => void;
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
      <div className="campus-avatar-field">
        <span>头像</span>
        <div className="campus-row">
          <AccountAvatar
            account={{
              id: "draft",
              owner: { kind: "public" },
              nickname: draft.nickname || "?",
              avatar: draft.avatar,
              bio: "",
              style: "",
              disabled: false,
              following: [],
              privateIdentity: false,
            }}
          />
          <Button onClick={onPickAvatar}>从图库选择</Button>
          {draft.avatar ? (
            <Button variant="danger" onClick={() => onChange({ ...draft, avatar: "" })}>
              清除
            </Button>
          ) : null}
        </div>
      </div>
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
