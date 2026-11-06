import { useState } from "react";
import { WechatComposer } from "./wechat-composer.tsx";
import { conversationId } from "../wechat.ts";
import type { WechatPageProps } from "./wechat-page.tsx";

/** 草稿留在当前页面；服务负责原归属保存失败后的恢复，表情提交保留文字。 */
export function WechatChatComposer({
  wechat,
  state,
  navigation,
  id,
  stickers,
  stickerState,
  sendMode,
  available,
  onHeightChange,
}: WechatPageProps & {
  id: string;
  available: boolean;
  onHeightChange(height: number): void;
}) {
  const [draft, setDraft] = useState(() => wechat.getDraft(id));
  const running = state.reply.status === "running";
  const sending = state.reply.status === "sending";
  const momentsBusy = ["running", "saving"].includes(state.momentGeneration.status);
  const account = state.data.account;
  const replying =
    running &&
    !!account &&
    state.reply.conversationId === conversationId(account.scopeId, account.id, id);
  async function submit(action: "send" | "enqueue") {
    const text = draft;
    setDraft("");
    if (!(await wechat[action](id, text))) {
      setDraft((current) => current || wechat.getDraft(id));
    }
  }
  return (
    <WechatComposer
      value={draft}
      disabled={
        !available ||
        running ||
        sending ||
        state.writeBusy ||
        state.reply.status === "saving" ||
        momentsBusy ||
        state.barrierSaving
      }
      replying={replying}
      onStop={() => wechat.cancel()}
      delayed={sendMode === "delayed"}
      onQueue={() => void submit("enqueue")}
      onChange={(text) => {
        setDraft(text);
        wechat.setDraft(id, text);
      }}
      onSend={() => void submit("send")}
      onHeightChange={onHeightChange}
      packs={stickerState.packs}
      stickers={stickers}
      onSendSticker={(marker) =>
        void wechat[sendMode === "delayed" ? "enqueue" : "send"](id, marker, {
          preserveDraft: true,
        })
      }
      onManageStickers={() => navigation.push({ page: "stickers" })}
    />
  );
}
