import { useEffect, useSyncExternalStore } from "react";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { CampusService } from "../campus-service.ts";
import { CampusAccountEditor } from "./campus-account-editor.tsx";
import { CampusComposePage } from "./campus-compose.tsx";
import { CampusGeneratePage } from "./campus-generate.tsx";
import { CampusHeatPage } from "./campus-heat.tsx";
import { CampusHome } from "./campus-home.tsx";
import { CampusImagePage } from "./campus-image.tsx";
import type { CampusRoute } from "./campus-page.tsx";
import { CampusPostPage } from "./campus-post.tsx";
import { CampusManageAccounts, CampusProfilePage } from "./campus-profiles.tsx";

export function CampusApp({
  service,
  active,
  onHome,
}: {
  service: CampusService;
  active: boolean;
  onHome: () => void;
}) {
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot);
  useEffect(() => service.open(), [service]);

  return (
    <NavigationStack<CampusRoute>
      key={state.scopeKey}
      initialRoutes={[{ page: "home" }]}
      active={active}
    >
      {(route, navigation) => {
        const props = { service, state, navigation, onHome };
        switch (route.page) {
          case "home":
            return <CampusHome {...props} />;
          case "post":
            return <CampusPostPage {...props} postId={route.postId} />;
          case "profile":
            return <CampusProfilePage {...props} accountId={route.accountId} />;
          case "manage":
            return <CampusManageAccounts {...props} />;
          case "edit-account":
            return <CampusAccountEditor {...props} accountId={route.accountId} />;
          case "compose":
            return <CampusComposePage key={state.data.activeAccountId} {...props} />;
          case "generate":
            return <CampusGeneratePage {...props} postId={route.postId} />;
          case "heat":
            return <CampusHeatPage {...props} postId={route.postId} />;
          case "image":
            return (
              <CampusImagePage
                key={state.data.activeAccountId}
                {...props}
                postId={route.postId}
                index={route.index}
              />
            );
        }
      }}
    </NavigationStack>
  );
}
