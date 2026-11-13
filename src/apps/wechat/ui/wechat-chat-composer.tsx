import type { Dispatch, SetStateAction } from "react";
import { WechatComposer } from "./wechat-composer.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { wechatChatWriteBusy } from "./wechat-chat-writing.ts";

/** 草稿由聊天页面持有；服务负责原归属保存失败后的恢复，表情提交保留文字。 */
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
  draft,
  setDraft,
  onHeightChange,
}: WechatPageProps & {
  id: string;
  available: boolean;
  currentId: string | null;
  group: boolean;
  active: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onHeightChange(height: number): void;
}) {
  const running = state.reply.status === "running";
  const replying = running && state.reply.conversationId === currentId;
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
