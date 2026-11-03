import { ActionSheet } from "../../../frontend/foundation/action-sheet.tsx";
import type { ActionSheetAction } from "../../../frontend/foundation/action-sheet.tsx";
import type { WechatConversation } from "../wechat.ts";
import type { wechatMemoryBoundaries } from "../wechat-memory.ts";
export type MemoryMenu =
  { type: "chat" } | { type: "message"; index: number } | { type: "barrier"; id: string };
export function WechatMemoryMenu({
  menu,
  conversation,
  effective,
  active,
  busy,
  disabled,
  onProfile,
  onInsert,
  onDelete,
  onDismiss,
}: {
  menu: MemoryMenu;
  conversation: WechatConversation | undefined;
  effective: ReturnType<typeof wechatMemoryBoundaries>[number] | undefined;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onProfile(): void;
  onInsert(after: string | null): void;
  onDelete(id: string): void;
  onDismiss(): void;
}) {
  const messages = conversation?.messages ?? [];
  let actions: ActionSheetAction[] = [];
  if (menu.type === "chat") {
    actions = [
      { label: "资料", onClick: () => onProfile() },
      { label: "在最前插入记忆屏障", disabled, onClick: () => onInsert(null) },
      {
        label: "在末尾插入记忆屏障",
        disabled,
        onClick: () => onInsert(messages.at(-1)?.id ?? null),
      },
    ];
  }
  if (menu.type === "message") {
    actions = [
      {
        label: "在此消息前插入",
        disabled,
        onClick: () => onInsert(messages[menu.index - 1]?.id ?? null),
      },
      { label: "在此消息后插入", disabled, onClick: () => onInsert(messages[menu.index]!.id) },
    ];
  }
  if (menu.type === "barrier") {
    actions = [
      { label: "删除记忆屏障", destructive: true, disabled, onClick: () => onDelete(menu.id) },
    ];
  }
  const location = effective
    ? effective.position === 0
      ? "首条消息前"
      : `第 ${effective.position} 条消息后`
    : "无开启屏障";
  const description = `当前生效：${location}。AI 仅使用屏障之后的微信消息。仅限制微信历史，剧情背景与 ST 消息仍会提供。屏障前的待回复消息将跳过，成功生成后结束原队列。${busy ? "回复或保存结束后可修改；生成中可先停止。" : ""}`;
  return (
    <ActionSheet
      active={active}
      label="记忆屏障操作"
      description={description}
      actions={actions}
      onDismiss={onDismiss}
    />
  );
}
