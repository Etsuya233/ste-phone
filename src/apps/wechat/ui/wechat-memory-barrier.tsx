import { Switch } from "../../../frontend/foundation/switch.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatMemoryBarrier as Barrier } from "../wechat.ts";

export function WechatMemoryBarrier({
  barrier,
  effective,
  disabled,
  onToggle,
  onMenu,
}: {
  barrier: Barrier;
  effective: boolean;
  disabled: boolean;
  onToggle(enabled: boolean): void;
  onMenu(): void;
}) {
  const status = !barrier.enabled ? "已关闭" : effective ? "生效中" : "已开启，受更新屏障限制";
  return (
    <div className="wechat-memory-barrier" data-barrier-id={barrier.id} tabIndex={-1}>
      <div>
        <strong>记忆屏障</strong>
        <span className="wechat-memory-status">{status}</span>
      </div>
      <div className="wechat-memory-actions">
        <Switch
          label="开启记忆屏障"
          checked={barrier.enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
        <Button aria-label="记忆屏障菜单" onClick={onMenu}>
          ···
        </Button>
      </div>
    </div>
  );
}
