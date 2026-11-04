import { useEffect, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { readProfileSummary } from "../profile-fields.ts";
import type { WechatSnapshot } from "../wechat.ts";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";
import { momentWritingReason } from "./wechat-moment-content.tsx";

export function WechatMomentParticipants({
  wechat,
  state,
  navigation,
  scopeId,
  id,
  active,
  onInteracted,
}: WechatPageProps & {
  scopeId: string;
  id: string;
  active: boolean;
  onInteracted(count: number): void;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [userDirection, setUserDirection] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = state.people.filter((person) => person.id !== state.data.account?.id);
  const reason = momentWritingReason(state, scopeId);
  useEffect(() => {
    // 返回详情只由本页这次生成的成功结果触发；后台完成时等待页面重新进入前台。
    if (active && complete) {
      navigation.pop();
    }
  }, [active, complete, navigation]);
  async function generate() {
    setError(null);
    const before = commentCount(wechat.getSnapshot(), scopeId, id);
    try {
      await wechat.moments.generateInteraction(id, selected, userDirection);
      const snapshot = wechat.getSnapshot();
      if (snapshot.momentGeneration.status === "complete") {
        onInteracted(commentCount(snapshot, scopeId, id) - before);
        setComplete(true);
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Page
      navBar={
        <NavBar
          title="选择参与人物"
          back={{ label: "返回", onClick: navigation.pop }}
          right={
            <Button disabled={!!reason || !candidates.length} onClick={() => void generate()}>
              生成互动
            </Button>
          }
        />
      }
    >
      <p className="wechat-notice">最多选择 5 人，每人至少回复一条；不选则由 AI 自行挑选。</p>
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      <div className="wechat-moment-ai-actions">
        <span>{selected.length ? `已选 ${selected.length}/5 人` : "未指定，由 AI 自行挑选"}</span>
        {selected.length ? (
          <Button disabled={!!reason} onClick={() => setSelected([])}>
            清空选择
          </Button>
        ) : null}
      </div>
      <details className="wechat-moment-optional">
        <summary>本次用户指引（选填）</summary>
        <textarea
          rows={3}
          aria-label="本次用户指引"
          value={userDirection}
          disabled={!!reason}
          placeholder="例如围绕照片里的猫聊天，让大家自然接话"
          onChange={(event) => setUserDirection(event.target.value)}
        />
      </details>
      <div className="wechat-rows">
        {candidates.map((person) => {
          const checked = selected.includes(person.id);
          return (
            <label className="wechat-moment-participant" key={person.id}>
              <input
                type="checkbox"
                aria-label={person.name}
                checked={checked}
                disabled={!!reason || (!checked && selected.length >= 5)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((current) =>
                    checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                  );
                }}
              />
              <PersonAvatar name={person.name} />
              <span>
                <strong>{person.name}</strong>
                <small>{readProfileSummary(person.profileText)}</small>
              </span>
            </label>
          );
        })}
      </div>
      {!candidates.length ? <p className="wechat-notice">没有可参与互动的其他人物。</p> : null}
      {error ? (
        <p className="wechat-notice" role="alert">
          {error}
        </p>
      ) : null}
    </Page>
  );
}

function commentCount(snapshot: WechatSnapshot, scopeId: string, id: string): number {
  return snapshot.data.moments?.[scopeId]?.find((moment) => moment.id === id)?.comments.length ?? 0;
}
