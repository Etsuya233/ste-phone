import { useSyncExternalStore } from "react";
import { NavigationStack } from "../../../frontend/foundation/foundation.tsx";
import type { BrowserService } from "../browser-service.ts";
import { BrowserLibrary } from "./browser-library.tsx";
import { BrowserNewWork } from "./browser-new-work.tsx";
import { BrowserConversation } from "./browser-conversation.tsx";
import type { BrowserModels } from "./browser-models.tsx";
import { BrowserModelPage } from "./browser-models.tsx";
import { BrowserPreview } from "./browser-preview.tsx";
import { BrowserSource } from "./browser-source.tsx";
import { BrowserVersions } from "./browser-versions.tsx";

type BrowserRoute =
  | { page: "library" | "new" | "models" }
  | { page: "preview"; id: string; fromNew?: boolean }
  | { page: "source" | "versions" | "conversation"; id: string };

export function BrowserApp({
  service,
  active,
  models,
  onHome,
}: {
  service: BrowserService;
  active: boolean;
  models: BrowserModels;
  onHome: () => void;
}) {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot);
  return (
    <div className="browser-app">
      <NavigationStack<BrowserRoute>
        key={snapshot.chatId}
        initialRoutes={[{ page: "library" }]}
        active={active}
      >
        {(route, navigation) => {
          const { push, pop } = navigation;
          switch (route.page) {
            case "library":
              return (
                <BrowserLibrary
                  snapshot={snapshot}
                  models={models}
                  current={navigation.current}
                  onHome={onHome}
                  onCreate={() => push({ page: "new" })}
                  onSettings={() => push({ page: "models" })}
                  onOpen={(id) => push({ page: "preview", id })}
                  onDiscard={(id) => service.discard(id)}
                  onStop={service.stop}
                />
              );
            case "new":
              return (
                <BrowserNewWork
                  key={snapshot.authorRevision}
                  service={service}
                  authorRevision={snapshot.authorRevision}
                  onBack={pop}
                  onCreate={(id) => push({ page: "preview", id, fromNew: true })}
                />
              );
            case "models":
              return <BrowserModelPage models={models} onBack={pop} />;
            default: {
              if (!("id" in route)) {
                throw new Error("浏览器页面缺少作品 ID");
              }
              const work =
                snapshot.drafts.get(route.id) ??
                snapshot.saved.works.find((item) => item.id === route.id)!;
              const props = { work, snapshot, service, onBack: pop };
              if (route.page === "source") {
                return <BrowserSource {...props} />;
              }
              if (route.page === "versions") {
                return <BrowserVersions {...props} />;
              }
              if (route.page === "conversation") {
                return <BrowserConversation {...props} models={models} />;
              }
              return (
                <BrowserPreview
                  {...props}
                  current={navigation.current}
                  backLabel={route.page === "preview" && route.fromNew ? "作者" : "作品"}
                  onChat={() => push({ page: "conversation", id: route.id })}
                  onSource={() => push({ page: "source", id: route.id })}
                  onVersions={() => push({ page: "versions", id: route.id })}
                />
              );
            }
          }
        }}
      </NavigationStack>
    </div>
  );
}
