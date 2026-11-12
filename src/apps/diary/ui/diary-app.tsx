import type { ImageHub } from "../../../core/image-hub/public.ts";
import { DiaryImagePicker } from "./diary-image-picker.tsx";
import { DiaryImageView } from "./diary-image-view.tsx";
import { DiaryImagePromptPage } from "./diary-image-prompt-page.tsx";
import { useEffect, useSyncExternalStore } from "react";
import type { DiaryService } from "../diary-service.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { DiaryRoute } from "./diary-page.tsx";
import { DiaryHomePage } from "./diary-home-page.tsx";
import { DiaryBookPage } from "./diary-book-page.tsx";
import { DiaryAuthorsPage } from "./diary-authors-page.tsx";
import { DiarySettingsPage } from "./diary-settings-page.tsx";
import { DiaryWritePage } from "./diary-write-page.tsx";
import { DiaryDetailPage } from "./diary-entry-page.tsx";

export function DiaryApp({
  diary,
  hub,
  active,
  onHome,
}: {
  diary: DiaryService;
  hub: ImageHub;
  active: boolean;
  onHome: () => void;
}) {
  const state = useSyncExternalStore(diary.subscribe, diary.getSnapshot);
  useEffect(() => {
    if (active) {
      void diary.prepare();
    }
  }, [diary, state.chatId, active]);
  return (
    <NavigationStack<DiaryRoute>
      key={state.chatId}
      active={active}
      initialRoutes={[{ page: "home" }]}
    >
      {(route, navigation) => {
        const props = { diary, state, navigation, onHome };
        let page;
        switch (route.page) {
          case "home":
            page = <DiaryHomePage {...props} />;
            break;
          case "book":
            page = <DiaryBookPage {...props} bookKey={route.bookKey} />;
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
          case "image-prompt":
            page = <DiaryImagePromptPage {...props} id={route.id} />;
            break;
          case "image-picker":
            page = <DiaryImagePicker {...props} imageHub={hub} id={route.id} />;
            break;
          case "image-view":
            page = <DiaryImageView {...props} id={route.id} />;
            break;
          case "detail":
            page = <DiaryDetailPage {...props} id={route.id} fromBookKey={route.fromBookKey} />;
            break;
        }
        return <div className="diary-app">{page}</div>;
      }}
    </NavigationStack>
  );
}
