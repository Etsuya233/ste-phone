import { useEffect, useState } from "react";
import { WechatComposer } from "./wechat-composer.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { wechatChatWriteBusy } from "./wechat-chat-writing.ts";

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
  currentId,
  group,
  active,
  onHeightChange,
}: WechatPageProps & {
  id: string;
  available: boolean;
  currentId: string | null;
  group: boolean;
  active: boolean;
  onHeightChange(height: number): void;
}) {
  const [draft, setDraft] = useState(() => wechat.getDraft(id));
  const running = state.reply.status === "running";
  const replying = running && state.reply.conversationId === currentId;
  useEffect(() => {
    // 指定发言页也可提交当前会话草稿；回到聊天时同步其保存结果。
    if (active) {
      setDraft(wechat.getDraft(id));
    }
  }, [active, id, wechat]);
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
      disabled={!available || wechatChatWriteBusy(state)}
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
      onPickImage={() => navigation.push({ page: "chat-image", id })}
      payments={
        group
          ? undefined
          : {
              onRedPacket: () =>
                navigation.push({ page: "chat-payment-compose", id, kind: "redPacket" }),
              onTransfer: () =>
                navigation.push({ page: "chat-payment-compose", id, kind: "transfer" }),
            }
      }
    />
  );
}
