import { useEffect, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";
import { momentWritingReason } from "./wechat-moment-content.tsx";

export function WechatMomentParticipants({
  wechat,
  state,
  navigation,
  scopeId,
  id,
  active,
}: WechatPageProps & { scopeId: string; id: string; active: boolean }) {
  const [selected, setSelected] = useState<readonly string[]>([]);
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
    try {
      await wechat.moments.generateInteraction(id, selected);
      if (wechat.getSnapshot().momentGeneration.status === "complete") {
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
          back={{ label: "动态详情", onClick: navigation.pop }}
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
        <span>{selected.length ? `已选择 ${selected.length} 人` : "由 AI 自行选择参与人物"}</span>
        {selected.length ? (
          <Button disabled={!!reason} onClick={() => setSelected([])}>
            清空选择
          </Button>
        ) : null}
      </div>
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
                <small>{person.profileText}</small>
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
