import { useEffect, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import {
  formatWechatAmount,
  parseWechatAmount,
  wechatPaymentStatus,
  type WechatPaymentAction,
} from "../wechat-message-content.ts";
import type { WechatPageProps } from "./wechat-page.tsx";
import { PersonAvatar } from "./wechat-page.tsx";
import { canWriteWechatChat, wechatChatWriteBusy } from "./wechat-chat-writing.ts";
import { WechatRedPacketIcon, WechatTransferIcon } from "./wechat-chat-icons.tsx";

export function WechatChatPaymentCompose({
  wechat,
  navigation,
  state,
  sendMode,
  id,
  kind,
  active,
}: WechatPageProps & { id: string; kind: "redPacket" | "transfer"; active: boolean }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"editing" | "saving" | "saved">("editing");
  const [error, setError] = useState("");
  const person = state.people.find((item) => item.id === id);
  const isPacket = kind === "redPacket";
  const title = isPacket ? "发红包" : "转账";
  useEffect(() => {
    if (phase === "saved" && active) {
      navigation.pop();
    }
  }, [phase, active, navigation]);
  async function send() {
    setError("");
    try {
      const amountFen = parseWechatAmount(amount);
      setPhase("saving");
      const sent = await wechat.sendContent(
        id,
        {
          type: kind,
          amountFen,
          note: note.trim(),
          status: "pending",
        },
        sendMode,
      );
      if (sent) {
        setPhase("saved");
        return;
      }
      const reply = wechat.getSnapshot().reply;
      setError(reply.status === "error" ? reply.error : "消息未发送，请重试。");
    } catch (cause) {
      setError((cause as Error).message);
    }
    setPhase("editing");
  }
  const disabled =
    phase !== "editing" || !canWriteWechatChat(state, id) || wechatChatWriteBusy(state);
  return (
    <Page
      className="wechat-payment-page"
      navBar={
        <NavBar
          title={title}
          back={{
            label: "聊天",
            onClick: () => {
              if (phase === "editing") {
                navigation.pop();
              }
            },
          }}
        />
      }
    >
      <form
        className={`wechat-payment-compose wechat-payment-compose--${kind}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) {
            void send();
          }
        }}
      >
        <div className="wechat-payment-hero">
          <span className="wechat-payment-emblem" aria-hidden="true">
            {isPacket ? <WechatRedPacketIcon /> : <WechatTransferIcon />}
          </span>
          <p className="wechat-payment-to">
            {person && <PersonAvatar path={person.avatar?.imagePath} name={person.name} />}
            <span>发给 {person?.name ?? "对方"}</span>
          </p>
          <label className="wechat-payment-amount">
            <span aria-hidden="true">¥</span>
            <input
              aria-label={`${title}金额（元）`}
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={phase !== "editing"}
              placeholder="0.00"
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <p className="wechat-payment-amount-hint">金额（元）</p>
        </div>
        <div className="wechat-payment-fields">
          <label className="wechat-form-field">
            <span>{isPacket ? "祝福语" : "备注"}</span>
            <input
              value={note}
              disabled={phase !== "editing"}
              placeholder={isPacket ? "恭喜发财，大吉大利" : "添加转账备注"}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="wechat-form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          className="wechat-payment-submit"
          type="submit"
          variant="filled"
          disabled={disabled || !amount.trim()}
        >
          {phase === "saving" ? "保存中…" : sendMode === "delayed" ? "加入队列" : title}
        </Button>
      </form>
    </Page>
  );
}

export function WechatChatPayment({
  wechat,
  navigation,
  state,
  id,
  messageId,
}: WechatPageProps & { id: string; messageId: string }) {
  const message = wechat.getConversation(id)?.messages.find((item) => item.id === messageId);
  const content = message?.content;
  const payment = content?.type === "redPacket" || content?.type === "transfer" ? content : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = payment?.type === "redPacket" ? "红包" : "转账";
  const canAct =
    payment?.status === "pending" &&
    !!state.data.account &&
    message?.senderId !== state.data.account.id &&
    !message?.recalled;
  const disabled = busy || !canWriteWechatChat(state, id) || wechatChatWriteBusy(state);
  async function act(action: WechatPaymentAction) {
    setBusy(true);
    setError("");
    try {
      await wechat.media.actOnPayment(id, messageId, action);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      className="wechat-payment-page"
      navBar={<NavBar title={title} back={{ label: "聊天", onClick: navigation.pop }} />}
    >
      {payment && !message?.recalled ? (
        <div className="wechat-payment-detail">
          <section className={`wechat-payment-card wechat-payment-card--${payment.type}`}>
            <span className="wechat-payment-emblem" aria-hidden="true">
              {payment.type === "redPacket" ? <WechatRedPacketIcon /> : <WechatTransferIcon />}
            </span>
            <p className="wechat-payment-kind">
              {payment.type === "redPacket" ? "微信红包" : "微信转账"}
            </p>
            {(payment.type !== "redPacket" ||
              payment.status !== "pending" ||
              message?.senderId === state.data.account?.id) && (
              <strong className="wechat-payment-total">
                ¥{formatWechatAmount(payment.amountFen)}
              </strong>
            )}
            {payment.note && <p className="wechat-payment-note">{payment.note}</p>}
            <p className="wechat-payment-status" role="status">
              {wechatPaymentStatus(payment)}
            </p>
          </section>
          {canAct && (
            <div className="wechat-payment-actions">
              <Button
                variant="filled"
                disabled={disabled}
                onClick={() => void act(payment.type === "redPacket" ? "claim" : "receive")}
              >
                {payment.type === "redPacket" ? "拆红包" : "确认收款"}
              </Button>
              {payment.type === "transfer" && (
                <Button disabled={disabled} onClick={() => void act("return")}>
                  退回
                </Button>
              )}
            </div>
          )}
          {error && (
            <p className="wechat-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="wechat-notice">这条消息已不可用。</p>
      )}
    </Page>
  );
}
