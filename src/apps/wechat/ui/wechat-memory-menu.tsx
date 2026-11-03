import { ActionSheet } from "../../../frontend/foundation/action-sheet.tsx";
import type { ActionSheetAction } from "../../../frontend/foundation/action-sheet.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import type { WechatConversation } from "../wechat.ts";
import type { wechatMemoryBoundaries } from "../wechat-memory.ts";
export type MemoryMenu =
  | { type: "chat" }
  | { type: "message"; index: number }
  | { type: "barrier"; id: string; position: number };
export function WechatMemoryMenu({
  menu,
  conversation,
  effective,
  active,
  skippedPending,
  lockReason,
  disabled,
  onProfile,
  onInsert,
  onToggle,
  onDelete,
  onDismiss,
}: {
  menu: MemoryMenu;
  conversation: WechatConversation | undefined;
  effective: ReturnType<typeof wechatMemoryBoundaries>[number] | undefined;
  active: boolean;
  skippedPending: number;
  lockReason: string | null;
  disabled: boolean;
  onProfile(): void;
  onInsert(after: string | null): void;
  onToggle(id: string, enabled: boolean): void;
  onDelete(id: string): void;
  onDismiss(): void;
}) {
  const messages = conversation?.messages ?? [];
  const barrier =
    menu.type === "barrier"
      ? conversation?.memoryBarriers?.find((item) => item.id === menu.id)
      : undefined;
  let actions: ActionSheetAction[] = [];
  let description: string;
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

  if (menu.type === "barrier") {
    const placement = menu.position === 0 ? "首条消息前" : `第 ${menu.position} 条消息后`;
    const current = !barrier?.enabled
      ? "已关闭"
      : effective?.barrier.id === menu.id
        ? "正在生效"
        : "已被后续开启的屏障接管";
    const consequence =
      barrier?.enabled && effective?.barrier.id === menu.id
        ? "删除后 AI 的读取范围会向前扩大"
        : "删除不影响当前 AI 读取范围";
    description = `位于${placement}，${current}。${consequence}，聊天记录不会被删除。${lockReason ? `${lockReason}。` : ""}`;
  } else {
    const scope = !effective
      ? "当前无开启的屏障，不额外排除微信消息。"
      : effective.position === 0
        ? "当前生效屏障位于首条消息前，不排除更早的微信消息。"
        : `当前生效屏障在第 ${effective.position} 条消息后，之前 ${effective.position} 条不计入 AI 读取。`;
    const insert = menu.type === "message" ? "插入后新增的屏障默认开启，可在聊天中随时关闭。" : "";
    const skipped =
      skippedPending > 0 ? `屏障前有 ${skippedPending} 条待回复消息，会在本次生成成功后跳过。` : "";
    description = `${scope}${insert}剧情背景、人物资料与 ST 消息不受影响。${skipped}${lockReason ? `${lockReason}。` : ""}`;
  }

  return (
    <ActionSheet
      active={active}
      label="记忆屏障操作"
      description={description}
      cancelLabel={menu.type === "barrier" ? "完成" : "取消"}
      control={
        menu.type === "barrier" && barrier ? (
          <Switch
            label="开启记忆屏障"
            checked={barrier.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) => onToggle(barrier.id, enabled)}
          />
        ) : null
      }
      actions={actions}
      onDismiss={onDismiss}
    />
  );
}
