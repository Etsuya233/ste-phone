import { useSyncExternalStore } from "react";
import type { WechatIntent, WechatIntentService } from "../public.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { WechatIntentEditor } from "./wechat-intent-editor.tsx";
import { WechatIntentPreview } from "./wechat-intent-preview.tsx";

type ContextRoute =
  | { page: "list" }
  | { page: "editor"; preset: WechatIntent | null }
  | { page: "preview"; preset: WechatIntent };

export function WechatIntents({
  service,
  active,
  onBack,
}: {
  service: WechatIntentService;
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
            <WechatIntentEditor
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
            <WechatIntentPreview service={service} preset={route.preset} onBack={navigation.pop} />
          );
        }
        return (
          <Page
            className="wechat-intent-page"
            navBar={
              <NavBar
                title="App Intent"
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
            <p className="wechat-intent-note">
              配置微信消息的读取范围。保存后可在手机「设置 → ST 接入」中引用这个 App Intent。
            </p>
            {snapshot.error ? (
              <p className="wechat-intent-error" role="alert">
                {snapshot.error}
              </p>
            ) : null}
            <GroupedList
              title="当前聊天的 App Intent"
              description="人物选择与读取范围按 ST 聊天分别保存。"
            >
              {snapshot.intents.map((preset) => (
                <ListCell
                  key={preset.id}
                  title={preset.name}
                  subtitle={`${preset.selection.personIds.length} 人 · ${preset.selection.recentMinutes === null ? "不限时间" : `最近 ${preset.selection.recentMinutes} 分钟`}`}
                  disabled={snapshot.saving}
                  onClick={() => navigation.push({ page: "editor", preset })}
                />
              ))}
            </GroupedList>
            {!snapshot.chatId ? (
              <p className="wechat-intent-note">请先打开一个 ST 聊天。</p>
            ) : snapshot.intents.length === 0 ? (
              <p className="wechat-intent-note">
                还没有 App Intent，点击「新增」选择人物与读取范围。
              </p>
            ) : null}
          </Page>
        );
      }}
    </NavigationStack>
  );
}
