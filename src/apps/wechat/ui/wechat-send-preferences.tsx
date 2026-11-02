import { useState, useSyncExternalStore } from "react";
import type { WechatPreferences } from "../../settings/public.ts";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";

export function WechatSendPreferences({ preferences }: { preferences: WechatPreferences }) {
  const mode = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="wechat-send-preferences">
      <SegmentedControl
        label="发送模式"
        value={mode}
        options={[
          { value: "immediate", label: "立即发送" },
          { value: "delayed", label: "延迟发送" },
        ]}
        onValueChange={(value) => {
          try {
            if (value !== "immediate" && value !== "delayed") {
              throw new Error("不支持的微信发送模式");
            }
            preferences.setSendMode(value);
            setError(null);
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
