import { useCallback, useEffect, useRef } from "react";
import { PersonAvatar } from "./wechat-page.tsx";

/** 长按只修改草稿；移动、滚动取消或离开页面时结束手势，避免迟到追加。 */
export function WechatMentionAvatar({
  name,
  path,
  active,
  onMention,
}: {
  name: string;
  path?: string;
  active: boolean;
  onMention(name: string): void;
}) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancel = useCallback(() => {
    if (hold.current) {
      clearTimeout(hold.current.timer);
    }
    hold.current = null;
    window.removeEventListener("blur", cancel);
  }, []);
  useEffect(() => {
    return cancel;
  }, [active, cancel]);
  return (
    <button
      type="button"
      className="wechat-mention-avatar"
      aria-label={`长按艾特${name}`}
      disabled={!active}
      onPointerDown={(event) => {
        cancel();
        if (event.button !== 0 || !event.isPrimary) {
          return;
        }
        window.addEventListener("blur", cancel);
        hold.current = {
          x: event.clientX,
          y: event.clientY,
          timer: setTimeout(() => {
            cancel();
            onMention(name);
          }, 500),
        };
      }}
      onPointerMove={(event) => {
        if (
          hold.current &&
          Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 8
        ) {
          cancel();
        }
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        // 键盘和辅助技术的激活无指针长按过程。
        if (event.detail === 0) {
          onMention(name);
        }
      }}
    >
      <PersonAvatar path={path} name={name} />
    </button>
  );
}
