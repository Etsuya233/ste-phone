import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { GalleryLibrary } from "./gallery-library.tsx";
import { GalleryViewer } from "./gallery-viewer.tsx";

type GalleryRoute =
  | { readonly page: "library" }
  | { readonly page: "viewer"; readonly images: readonly ImageRecord[]; readonly index: number };

export function GalleryApp({
  active,
  hub,
  onHome,
  onOpen,
}: {
  active: boolean;
  hub: ImageHub;
  onHome: () => void;
  onOpen: (app: "image-playground") => void;
}) {
  return (
    <NavigationStack<GalleryRoute> active={active} initialRoutes={[{ page: "library" }]}>
      {(route, navigation) =>
        route.page === "library" ? (
          <GalleryLibrary
            active={active}
            hub={hub}
            onHome={onHome}
            onOpenPlayground={() => onOpen("image-playground")}
            onOpenImage={(images, index) => navigation.push({ page: "viewer", images, index })}
          />
        ) : (
          <GalleryViewer
            images={route.images}
            initialIndex={route.index}
            active={active}
            onBack={navigation.pop}
          />
        )
      }
    </NavigationStack>
  );
}
