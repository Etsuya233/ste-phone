import { useId, useState, useSyncExternalStore } from "react";
import type { AppearanceSettings, DeviceModel, SystemStyle } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";

const deviceChoices: { value: DeviceModel; label: string; detail: string }[] = [
  { value: "iphone-6s", label: "iPhone 6s", detail: "经典边框与实体 Home 键" },
  { value: "iphone-17", label: "iPhone 17", detail: "全面屏与灵动岛" },
];
const systemChoices: { value: SystemStyle; label: string; detail: string }[] = [
  { value: "classic", label: "经典 iOS", detail: "简洁的平面控件与导航" },
  { value: "ios26", label: "iOS 26", detail: "圆润分组与玻璃质感" },
  { value: "material3", label: "Material 3", detail: "薄荷色界面、胶囊控件与圆角面板" },
];

export function AppearancePage({
  appearance,
  onBack,
}: {
  appearance: AppearanceSettings;
  onBack: () => void;
}) {
  const saved = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const [error, setError] = useState("");
  const groupId = useId();
  function saveSelection(save: () => void) {
    try {
      save();
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <Page
      className="appearance-page"
      navBar={<NavBar title="外观" back={{ label: "设置", onClick: onBack }} />}
    >
      {error ? (
        <p className="appearance-error" role="alert">
          {error}
        </p>
      ) : null}
      <GroupedList title="手机外形" description="手机外形与系统风格可以自由搭配。">
        {deviceChoices.map((choice) => (
          <ListCell
            key={choice.value}
            title={
              <label className="appearance-choice">
                <input
                  type="radio"
                  aria-label={choice.label}
                  name={`${groupId}-device`}
                  checked={saved.deviceModel === choice.value}
                  onChange={() => saveSelection(() => appearance.setDeviceModel(choice.value))}
                />
                <span className="ios-cell-copy">
                  <span>{choice.label}</span>
                  <span className="ios-cell-subtitle">{choice.detail}</span>
                </span>
                <span className="appearance-check" aria-hidden="true">
                  ✓
                </span>
              </label>
            }
          />
        ))}
      </GroupedList>
      <GroupedList title="系统风格" description="选择后立即应用，当前页面与应用内容保留。">
        {systemChoices.map((choice) => (
          <ListCell
            key={choice.value}
            title={
              <label className="appearance-choice">
                <input
                  type="radio"
                  aria-label={choice.label}
                  name={`${groupId}-system`}
                  checked={saved.systemStyle === choice.value}
                  onChange={() => saveSelection(() => appearance.setSystemStyle(choice.value))}
                />
                <span className="ios-cell-copy">
                  <span>{choice.label}</span>
                  <span className="ios-cell-subtitle">{choice.detail}</span>
                </span>
                <span className="appearance-check" aria-hidden="true">
                  ✓
                </span>
              </label>
            }
          />
        ))}
      </GroupedList>
    </Page>
  );
}
