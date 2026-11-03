import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { wechatMemoryBoundaries } from "../wechat-memory.ts";
import type { WechatConversation } from "../wechat.ts";
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
  const [menu, setMenu] = useState<MemoryMenu | null>(null);
  const [position, setPosition] = useState<{ top: number; target?: string } | null>(null);
  let boundaries: ReturnType<typeof wechatMemoryBoundaries> = [];
  let error: string | null = null;
  try {
    if (conversation) {
      boundaries = wechatMemoryBoundaries(conversation);
    }
  } catch (failure) {
    error = (failure as Error).message;
  }
  const effective = boundaries.findLast((item) => item.barrier.enabled);
  const busy =
    state.writeBusy || state.barrierSaving || !["idle", "error"].includes(state.reply.status);
  const disabled = busy || !!error || !state.data.account || state.loading || !!state.error;
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
  return {
    boundaries,
    effectiveId: effective?.barrier.id,
    error,
    disabled,
    menuOpen: !!menu,
    openChat: () => setMenu({ type: "chat" }),
    openMessage: (index: number) => setMenu({ type: "message", index }),
    openBarrier: (barrierId: string) => setMenu({ type: "barrier", id: barrierId }),
    toggle,
    sheet: menu ? (
      <WechatMemoryMenu
        menu={menu}
        conversation={conversation}
        effective={effective}
        active={active}
        busy={busy}
        disabled={disabled}
        onProfile={() => navigation.push({ page: "person", id })}
        onInsert={(after) => void insert(after)}
        onDelete={(barrierId) => void remove(barrierId)}
        onDismiss={() => setMenu(null)}
      />
    ) : null,
  };
}
