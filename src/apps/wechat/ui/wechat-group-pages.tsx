import { useEffect, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { WechatChatTimeline } from "./wechat-chat.tsx";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";
import { wechatChatWriteBusy } from "./wechat-chat-writing.ts";
import type { WechatGroupConversation } from "../wechat.ts";

export function WechatGroupChat(props: WechatPageProps & { id: string; active: boolean }) {
  const { wechat, id, state, navigation } = props;
  const group = wechat.getConversation(id);
  return group?.kind === "group" ? (
    <WechatChatTimeline
      {...props}
      conversation={group}
      name={group.name}
      currentId={group.id}
      canSend={state.scopeId === group.people[0].scopeId}
    />
  ) : (
    <Page navBar={<NavBar title="群聊" back={{ label: "微信", onClick: navigation.pop }} />}>
      <p className="wechat-notice">当前帐号无法访问此群聊。</p>
    </Page>
  );
}

export function WechatGroupDetailsPage(props: WechatPageProps & { id?: string; active: boolean }) {
  const { state, id, wechat, navigation } = props;
  const group = id === undefined ? undefined : wechat.getConversation(id);
  const account = state.data.account;
  if (!account || (id !== undefined && group?.kind !== "group")) {
    return (
      <Page navBar={<NavBar title="群资料" back={{ label: "返回", onClick: navigation.pop }} />}>
        <p className="wechat-notice">当前帐号无法访问此群聊。</p>
      </Page>
    );
  }
  return (
    <GroupDetailsForm
      {...props}
      accountId={account.id}
      group={group?.kind === "group" ? group : undefined}
    />
  );
}

function GroupDetailsForm({
  wechat,
  state,
  navigation,
  group,
  accountId,
  active,
}: WechatPageProps & {
  active: boolean;
  group?: WechatGroupConversation;
  accountId: string;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [members, setMembers] = useState(group?.memberIds ?? [accountId]);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<"idle" | "saving" | "saved">("idle");
  const busy =
    submission !== "idle" || wechatChatWriteBusy(state) || state.loading || !!state.error;
  const available = new Set(state.people.map(({ id }) => id));
  const candidates = [
    ...state.people,
    ...(group?.people.filter(({ id }) => group.memberIds.includes(id) && !available.has(id)) ?? []),
  ];
  useEffect(() => {
    if (active && submission === "saved") {
      navigation.pop();
    }
  }, [active, navigation, submission]);
  async function save() {
    setError("");
    setSubmission("saving");
    try {
      await wechat.saveGroup({ name, description, memberIds: members }, group?.id);
      setSubmission("saved");
    } catch (failure) {
      setSubmission("idle");
      setError((failure as Error).message);
    }
  }
  return (
    <Page
      navBar={
        <NavBar
          title={group ? "群资料" : "发起群聊"}
          back={{ label: "返回", onClick: navigation.pop, disabled: submission !== "idle" }}
          right={
            <Button
              disabled={busy || !name.trim() || (!group && members.length < 2)}
              onClick={() => void save()}
            >
              {group ? "保存" : "创建"}
            </Button>
          }
        />
      }
    >
      <div className="wechat-group-fields">
        <label>
          群名
          <input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
        </label>
        <label>
          群说明
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
          />
        </label>
        <fieldset disabled={busy}>
          <legend>群成员（{members.length}）</legend>
          {candidates.map((person) => (
            <GroupPersonOption
              key={person.id}
              person={person}
              checked={members.includes(person.id)}
              disabled={person.id === accountId}
              onChange={(checked) =>
                setMembers((current) =>
                  checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                )
              }
            />
          ))}
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </Page>
  );
}

export function WechatGroupRound({
  wechat,
  state,
  id,
  navigation,
  active,
}: WechatPageProps & { id: string; active: boolean }) {
  const group = wechat.getConversation(id);
  const accountId = state.data.account?.id;
  const [specified, setSpecified] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [guidance, setGuidance] = useState("");
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<"idle" | "sending" | "sent">("idle");
  const candidates =
    group?.kind === "group"
      ? state.people.filter(
          (person) => person.id !== accountId && group.memberIds.includes(person.id),
        )
      : [];
  const busy =
    submission !== "idle" || wechatChatWriteBusy(state) || state.loading || !!state.error;
  useEffect(() => {
    if (active && submission === "sent") {
      navigation.pop();
    }
  }, [active, navigation, submission]);
  function send() {
    setError("");
    const text = wechat.getDraft(id);
    setSubmission(text.trim() ? "sending" : "sent");
    void wechat
      .send(id, text, {
        onSent: () => setSubmission("sent"),
        round: { memberIds: specified ? members : undefined, guidance },
      })
      .then(
        (saved) => {
          const reply = wechat.getSnapshot().reply;
          if (!saved && reply.status === "error") {
            setSubmission("idle");
            setError(reply.error);
          }
        },
        (failure: Error) => {
          setSubmission("idle");
          setError(failure.message);
        },
      );
  }
  return (
    <Page
      navBar={
        <NavBar
          title="本轮发言设置"
          back={{ label: "返回", onClick: navigation.pop, disabled: submission !== "idle" }}
          right={
            <Button
              disabled={busy || !candidates.length || (specified && !members.length)}
              onClick={send}
            >
              发送
            </Button>
          }
        />
      }
    >
      <div className="wechat-group-fields">
        <fieldset disabled={busy}>
          <legend>发言方式</legend>
          <label>
            <input
              type="radio"
              name={id}
              checked={!specified}
              onChange={() => setSpecified(false)}
            />
            自动参与
          </label>
          <label>
            <input type="radio" name={id} checked={specified} onChange={() => setSpecified(true)} />
            指定人物
          </label>
          {specified
            ? candidates.map((person) => (
                <GroupPersonOption
                  key={person.id}
                  person={person}
                  checked={members.includes(person.id)}
                  onChange={(checked) =>
                    setMembers((current) =>
                      checked
                        ? [...current, person.id]
                        : current.filter((member) => member !== person.id),
                    )
                  }
                />
              ))
            : null}
        </fieldset>
        <label>
          本轮指引
          <textarea
            value={guidance}
            disabled={busy}
            onChange={(event) => setGuidance(event.target.value)}
          />
        </label>
        <p>发送会提交当前草稿与队列，并按本页设置生成回复。</p>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </Page>
  );
}

function GroupPersonOption({
  person,
  checked,
  disabled,
  onChange,
}: {
  person: { name: string; avatar?: { imagePath: string } };
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="wechat-group-person">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <PersonAvatar name={person.name} path={person.avatar?.imagePath} />
      {person.name}
      {disabled ? "（当前帐号）" : ""}
    </label>
  );
}
