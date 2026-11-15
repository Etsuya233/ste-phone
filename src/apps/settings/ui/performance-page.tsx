import { useState, useSyncExternalStore } from "react";
import type { PerformanceSettings } from "../public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import { TextField } from "../../../frontend/foundation/text-field.tsx";

export function PerformancePage({
  performance,
  onBack,
}: {
  performance: PerformanceSettings;
  onBack: () => void;
}) {
  const saved = useSyncExternalStore(performance.subscribe, performance.getSnapshot);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const savedLimit = saved.appLimit === null ? "" : String(saved.appLimit);
  const limitText = draft ?? savedLimit;

  function saveSetting(save: () => void) {
    try {
      save();
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  return (
    <Page navBar={<NavBar title="性能" back={{ label: "设置", onClick: onBack }} />}>
      <GroupedList description="控制手机窗口、主屏幕、后台卡片和页面转场的动画。">
        <ListCell
          title={
            <Switch
              label="系统动画"
              checked={saved.systemAnimations}
              onCheckedChange={(enabled) =>
                saveSetting(() => performance.setSystemAnimations(enabled))
              }
            />
          }
        />
      </GroupedList>
      <GroupedList description="最少 1 个，留空为不限。前台应用也计入。保存后立即退出超出上限且最久未使用的应用，未保存的草稿可能丢失，生成中的任务可能中断。">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveSetting(() => {
              performance.setAppLimit(limitText === "" ? null : Number(limitText));
              setDraft(null);
            });
          }}
        >
          <TextField
            label="应用数量上限"
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            placeholder="不限"
            value={limitText}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            accessory={
              <Button type="submit" disabled={limitText === savedLimit}>
                保存
              </Button>
            }
          />
        </form>
      </GroupedList>
      {error ? (
        <p className="performance-error" role="alert">
          {error}
        </p>
      ) : null}
    </Page>
  );
}
