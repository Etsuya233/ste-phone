import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { wechatMemoryBoundaries } from "../wechat-memory.ts";
import { pendingWechatMessages } from "../wechat.ts";
import type { WechatMessageEdit } from "../wechat-message-edit.ts";
import type { WechatConversation, WechatSnapshot } from "../wechat.ts";
import type { WechatPageProps } from "./wechat-page.tsx";

import { WechatMemoryMenu } from "./wechat-memory-menu.tsx";
import type { MemoryMenu } from "./wechat-memory-menu.tsx";
export function useWechatMemory({
  wechat,
  state,
  navigation,
  id,
  active,
  conversation,
  end,
}: WechatPageProps & {
  id: string;
  active: boolean;
  conversation: WechatConversation | undefined;
  end: RefObject<HTMLDivElement | null>;
}) {
  const [selection, setMenu] = useState<MemoryMenu | null>(null);
  // 保存期间仍可阅读旧消息，提交后关闭已失去目标的菜单。
  const menu =
    (selection?.type === "message" || selection?.type === "confirm-delete") &&
    !conversation?.messages.some((message) => message.id === selection.id)
      ? null
      : selection;
  const [position, setPosition] = useState<{ top: number; target?: string } | null>(null);
  let boundaries: ReturnType<typeof wechatMemoryBoundaries> = [];
  let effective: ReturnType<typeof wechatMemoryBoundaries>[number] | undefined;
  let skippedPending = 0;
  let error: string | null = null;
  try {
    if (conversation) {
      boundaries = wechatMemoryBoundaries(conversation);
      effective = boundaries.findLast((item) => item.barrier.enabled);
      if (effective && effective.position > 0 && state.data.account) {
        const before = new Set(
          conversation.messages.slice(0, effective.position).map((message) => message.id),
        );
        skippedPending = pendingWechatMessages(conversation, state.data.account.id).filter(
          (message) => before.has(message.id),
        ).length;
      }
    }
  } catch (failure) {
    error = (failure as Error).message;
  }
  const lockReason = memoryLockReason(state);
  const disabled = !!lockReason || !!error || !state.data.account || state.loading || !!state.error;
  const container = () => end.current?.closest<HTMLElement>(".ios-page-content");
  useLayoutEffect(() => {
    if (!active || menu || !position) {
      return;
    }
    const content = container();
    if (!content) {
      return;
    }
    content.scrollTop = position.top;
    const row =
      position.target === "chat-menu"
        ? content.closest(".ios-page")?.querySelector<HTMLElement>("[aria-label='聊天菜单']")
        : position.target
          ? content.querySelector<HTMLElement>(`[data-barrier-id="${position.target}"]`)
          : null;
    if (row) {
      if (position.target !== "chat-menu") {
        row.scrollIntoView({ block: "nearest" });
      }
      row.focus({ preventScroll: true });
    }
    setPosition(null);
  }, [active, menu, position]);
  async function insert(after: string | null) {
    const top = container()?.scrollTop ?? 0;
    const inserted = await wechat.memory.insert(id, after);
    setPosition({ top, target: inserted ?? undefined });
  }
  async function toggle(barrierId: string, enabled: boolean) {
    const top = container()?.scrollTop ?? 0;
    await wechat.memory.setEnabled(id, barrierId, enabled);
    setPosition({ top });
  }
  async function remove(barrierId: string) {
    const top = container()?.scrollTop ?? 0;
    await wechat.memory.delete(id, barrierId);
    setPosition({ top, target: "chat-menu" });
  }
  async function editMessage(messageId: string, action: WechatMessageEdit) {
    const top = container()?.scrollTop ?? 0;
    await wechat.editMessage(id, messageId, action);
    if (action === "delete") {
      setPosition({ top, target: "chat-menu" });
    }
  }
  return {
    boundaries,
    effectiveId: effective?.barrier.id,
    error,
    disabled,
    lockReason,
    menuOpen: !!menu,
    openChat: () => setMenu({ type: "chat" }),
    openMessage: (messageId: string) => setMenu({ type: "message", id: messageId }),
    openBarrier: (barrierId: string, position: number) =>
      setMenu({ type: "barrier", id: barrierId, position }),
    toggle,
    sheet: menu ? (
      <WechatMemoryMenu
        key={menu.type}
        menu={menu}
        accountId={state.data.account?.id}
        conversation={conversation}
        effective={effective}
        active={active}
        skippedPending={skippedPending}
        lockReason={lockReason}
        disabled={disabled}
        onProfile={() => navigation.push({ page: "person", id })}
        onInsert={(after) => void insert(after)}
        onToggle={(barrierId, enabled) => void toggle(barrierId, enabled)}
        onDelete={(barrierId) => void remove(barrierId)}
        onEdit={(messageId, action) => void editMessage(messageId, action)}
        onConfirmDelete={(messageId) => setMenu({ type: "confirm-delete", id: messageId })}
        onDismiss={() => setMenu(null)}
      />
    ) : null,
  };
}

/** 屏障编辑与回复、消息保存共用写入互斥，就地说明当前不能修改的原因。 */
function memoryLockReason(state: WechatSnapshot): string | null {
  if (state.barrierSaving) {
    return "屏障保存中，暂不可修改";
  }
  switch (state.reply.status) {
    case "sending":
      return "消息发送中，暂不可修改";
    case "running":
      return "AI 回复中，可先停止再修改";
    case "saving":
      return "回复保存中，暂不可修改";
    case "idle":
    case "error":
      break;
  }
  if (["running", "saving"].includes(state.momentGeneration.status)) {
    return "朋友圈任务进行中，暂不可修改";
  }
  return state.writeBusy ? "消息保存中，暂不可修改" : null;
}
