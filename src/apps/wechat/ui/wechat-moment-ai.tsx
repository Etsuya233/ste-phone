import { useEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { PersonAvatar } from "./wechat-page.tsx";
import type { MomentDraft } from "../wechat-moments.ts";
import { WechatMomentCompose } from "./wechat-moment-compose.tsx";
import { momentWritingReason } from "./wechat-moment-content.tsx";

export function WechatMomentAiAuthor(
  props: WechatPageProps & { scopeId: string; active: boolean },
) {
  const { wechat, state, navigation, scopeId } = props;
  const [draft, setDraft] = useState<MomentDraft | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const reason = momentWritingReason(state, scopeId);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (running.current) {
        wechat.moments.generation.cancel();
      }
    };
  }, [wechat]);
  async function generate(id: string) {
    setError(null);
    setWorking(true);
    running.current = true;
    try {
      const result = await wechat.moments.generatePost(id);
      if (mounted.current) {
        setDraft(result);
      }
    } catch (cause) {
      if (mounted.current && (cause as Error).name !== "AbortError") {
        setError((cause as Error).message);
      }
    } finally {
      running.current = false;
      if (mounted.current) {
        setWorking(false);
      }
    }
  }
  function back() {
    if (running.current) {
      wechat.moments.generation.cancel();
    }
    navigation.pop();
  }
  if (draft) {
    return <WechatMomentCompose {...props} initialDraft={draft} onPublished={() => {}} />;
  }
  return (
    <Page navBar={<NavBar title="AI 生成动态" back={{ label: "朋友圈", onClick: back }} />}>
      <p className="wechat-notice">选择一名人物，AI 将以其身份起草动态，编辑后再发布。</p>
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      <div className="wechat-rows">
        {state.people.map((person) => (
          <button
            type="button"
            className="wechat-row"
            key={person.id}
            disabled={working || !!reason}
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
                : generation.status === "running" && generation.kind === "image"
                  ? "正在生成图片…"
                  : generation.status === "running" && generation.kind === "image-prompt"
                    ? "正在完善绘图提示词…"
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
