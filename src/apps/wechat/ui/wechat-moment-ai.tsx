import { useEffect, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { PersonAvatar } from "./wechat-page.tsx";
import { momentWritingReason } from "./wechat-moment-content.tsx";

export function WechatMomentAiAuthor({
  wechat,
  state,
  navigation,
  scopeId,
  active,
}: WechatPageProps & { scopeId: string; active: boolean }) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = momentWritingReason(state, scopeId);
  useEffect(() => {
    if (active && requested && state.momentGeneration.status === "complete") {
      navigation.pop();
    }
  }, [active, requested, state.momentGeneration.status, navigation]);
  async function generate(id: string) {
    setError(null);
    setRequested(true);
    try {
      await wechat.moments.generatePost(id);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Page
      navBar={<NavBar title="AI 发布动态" back={{ label: "朋友圈", onClick: navigation.pop }} />}
    >
      <p className="wechat-notice">选择一名人物，AI 将以其身份直接发布一条动态。</p>
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      <div className="wechat-rows">
        {state.people.map((person) => (
          <button
            type="button"
            className="wechat-row"
            key={person.id}
            disabled={!!reason}
            onClick={() => void generate(person.id)}
          >
            <PersonAvatar name={person.name} />
            <strong>{person.name}</strong>
          </button>
        ))}
      </div>
      {error ? (
        <p className="wechat-notice" role="alert">
          {error}
        </p>
      ) : null}
    </Page>
  );
}

/** 提示在微信内持续可见，不阻断阅读和草稿编辑；停止保存时等待存储撤回确认。 */
export function MomentGenerationNotice({
  wechat,
  state,
}: Pick<WechatPageProps, "wechat" | "state">) {
  const generation = state.momentGeneration;
  if (generation.status === "idle") {
    return null;
  }
  const finished = generation.status === "complete" || generation.status === "error";
  return (
    <div
      className="wechat-moment-generation"
      role={generation.status === "error" ? "alert" : "status"}
    >
      <span>
        {generation.status === "complete" || generation.status === "error"
          ? generation.message
          : generation.status === "stopping"
            ? "正在停止并确认保存撤回…"
            : generation.status === "saving"
              ? "正在保存朋友圈…"
              : generation.status === "running" && generation.kind === "post"
                ? "正在生成动态…"
                : "正在生成互动…"}
      </span>
      <Button
        disabled={generation.status === "stopping"}
        onClick={
          finished ? wechat.moments.generation.dismiss : () => wechat.moments.generation.cancel()
        }
      >
        {finished ? "好" : generation.status === "stopping" ? "停止中" : "停止"}
      </Button>
    </div>
  );
}
