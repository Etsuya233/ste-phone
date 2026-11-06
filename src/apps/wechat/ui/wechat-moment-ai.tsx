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
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [userDirection, setUserDirection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const reason = momentWritingReason(state, scopeId);
  const disabled = working || !!reason;
  const author = state.people.find((person) => person.id === authorId);
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
      const result = await wechat.moments.generatePost(id, userDirection);
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
    <Page
      navBar={
        <NavBar
          title="AI 生成动态"
          back={{ label: "返回", onClick: back }}
          right={
            <Button
              disabled={disabled || !author}
              onClick={() => author && void generate(author.id)}
            >
              生成草稿
            </Button>
          }
        />
      }
    >
      <p className="wechat-notice">
        选择一位发布人物，可填写本次指引。点击「生成草稿」后，可编辑再发布。
      </p>
      <div className="wechat-moment-editor">
        <label className="wechat-moment-label">
          本次用户指引
          <textarea
            rows={3}
            value={userDirection}
            disabled={disabled}
            placeholder="选填，例如分享逛街日常，语气轻松，配两张图片"
            onChange={(event) => setUserDirection(event.target.value)}
          />
        </label>
      </div>
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      <div className="wechat-rows" role="group" aria-label="发布人物">
        {state.people.map((person) => (
          <label className="wechat-moment-participant" key={person.id}>
            <input
              type="radio"
              name="moment-author"
              aria-label={person.name}
              checked={author?.id === person.id}
              disabled={disabled}
              onChange={() => setAuthorId(person.id)}
            />
            <PersonAvatar name={person.name} />
            <strong>{person.name}</strong>
          </label>
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

const momentRunningText = {
  post: "正在生成动态…",
  image: "正在生成图片…",
  "image-prompt": "正在完善绘图提示词…",
  interaction: "正在生成互动…",
};

/** 生成和保存提示在微信内持续可见，保存期间隐藏停止按钮。 */
export function MomentGenerationNotice({
  wechat,
  state,
}: Pick<WechatPageProps, "wechat" | "state">) {
  const generation = state.momentGeneration;
  if (generation.status === "idle") {
    return null;
  }
  return (
    <div
      className="wechat-moment-generation"
      role={generation.status === "error" ? "alert" : "status"}
    >
      <span>
        {"message" in generation
          ? generation.message
          : generation.status === "saving"
            ? "正在保存朋友圈…"
            : momentRunningText[generation.kind]}
      </span>
      {generation.status === "running" && (
        <Button onClick={() => wechat.moments.generation.cancel()}>停止</Button>
      )}
      {(generation.status === "complete" || generation.status === "error") && (
        <Button onClick={wechat.moments.generation.dismiss}>好</Button>
      )}
    </div>
  );
}
