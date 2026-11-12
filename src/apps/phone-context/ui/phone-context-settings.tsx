import { useSyncExternalStore } from "react";
import type { PhoneContextPreset, PhoneContextService } from "../public.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { PhoneContextEditor } from "./phone-context-editor.tsx";
import { PhoneContextPreview } from "./phone-context-preview.tsx";

type ContextRoute =
  | { page: "list" }
  | { page: "editor"; preset: PhoneContextPreset | null }
  | { page: "preview"; preset: PhoneContextPreset };

export function PhoneContextSettings({
  service,
  active,
  onBack,
}: {
  service: PhoneContextService;
  active: boolean;
  onBack(): void;
}) {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot);
  // 草稿和页面栈归属于打开时的 ST 聊天，切换后销毁旧页面及其异步结果接收者。
  return (
    <NavigationStack<ContextRoute>
      key={snapshot.chatId}
      initialRoutes={[{ page: "list" }]}
      active={active}
    >
      {(route, navigation) => {
        if (route.page === "editor") {
          return (
            <PhoneContextEditor
              service={service}
              preset={route.preset}
              active={active && navigation.current}
              onBack={navigation.pop}
              onPreview={(preset) => navigation.push({ page: "preview", preset })}
            />
          );
        }
        if (route.page === "preview") {
          return (
            <PhoneContextPreview service={service} preset={route.preset} onBack={navigation.pop} />
          );
        }
        return (
          <Page
            className="phone-context-page"
            navBar={
              <NavBar
                title="ST 接入"
                back={{ label: "设置", onClick: onBack }}
                right={
                  <Button
                    disabled={!snapshot.chatId || snapshot.saving}
                    onClick={() => navigation.push({ page: "editor", preset: null })}
                  >
                    新增
                  </Button>
                }
              />
            }
          >
            <p className="phone-context-note">
              将宏绑定到应用提供的 App Intent，再复制到 ST 提示词。展开时同步读取已保存内容。
            </p>
            {snapshot.error ? (
              <p className="phone-context-error" role="alert">
                {snapshot.error}
              </p>
            ) : null}
            <GroupedList
              title="当前聊天的宏绑定"
              description="宏绑定按 ST 聊天分别保存，读取条件在各应用内管理。"
            >
              {snapshot.presets.map((preset) => (
                <ListCell
                  key={preset.id}
                  title={preset.name}
                  subtitle={`{{phone::${preset.id}}}`}
                  disabled={snapshot.saving}
                  onClick={() => navigation.push({ page: "editor", preset })}
                />
              ))}
            </GroupedList>
            {!snapshot.chatId ? (
              <p className="phone-context-note">请先打开一个 ST 聊天。</p>
            ) : snapshot.presets.length === 0 ? (
              <p className="phone-context-note">
                还没有宏绑定，点击「新增」选择应用与 App Intent。
              </p>
            ) : null}
          </Page>
        );
      }}
    </NavigationStack>
  );
}
