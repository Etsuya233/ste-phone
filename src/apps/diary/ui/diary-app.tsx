import { useEffect, useSyncExternalStore } from "react";
import type { DiaryService } from "../diary-service.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { DiaryRoute } from "./diary-page.tsx";
import { DiaryListPage } from "./diary-list-page.tsx";
import { DiaryAuthorsPage } from "./diary-authors-page.tsx";
import { DiarySettingsPage } from "./diary-settings-page.tsx";
import { DiaryWritePage } from "./diary-write-page.tsx";
import { DiaryDetailPage } from "./diary-entry-page.tsx";

export function DiaryApp({
  diary,
  active,
  onHome,
}: {
  diary: DiaryService;
  active: boolean;
  onHome: () => void;
}) {
  const state = useSyncExternalStore(diary.subscribe, diary.getSnapshot);
  useEffect(() => {
    void diary.prepare();
  }, [diary, state.chatId]);
  return (
    <NavigationStack<DiaryRoute>
      key={state.chatId}
      active={active}
      initialRoutes={[{ page: "list" }]}
    >
      {(route, navigation) => {
        const props = { diary, state, navigation, onHome };
        let page;
        switch (route.page) {
          case "list":
            page = <DiaryListPage {...props} />;
            break;
          case "authors":
            page = <DiaryAuthorsPage {...props} />;
            break;
          case "settings":
            page = <DiarySettingsPage {...props} />;
            break;
          case "write":
            page = <DiaryWritePage {...props} />;
            break;
          case "detail":
            page = <DiaryDetailPage {...props} id={route.id} />;
            break;
        }
        return <div className="diary-app">{page}</div>;
      }}
    </NavigationStack>
  );
}
