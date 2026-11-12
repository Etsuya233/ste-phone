import type { GalleryImage } from "../public.ts";
import type { GalleryService } from "../gallery-service.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { GalleryLibrary } from "./gallery-library.tsx";
import { GalleryViewer } from "./gallery-viewer.tsx";

type GalleryRoute =
  | { readonly page: "library" }
  | { readonly page: "viewer"; readonly images: readonly GalleryImage[]; readonly index: number };

export function GalleryApp({
  active,
  gallery,
  onHome,
  onOpen,
}: {
  active: boolean;
  gallery: GalleryService;
  onHome: () => void;
  onOpen: (app: "image-playground") => void;
}) {
  return (
    <NavigationStack<GalleryRoute> active={active} initialRoutes={[{ page: "library" }]}>
      {(route, navigation) =>
        route.page === "library" ? (
          <GalleryLibrary
            active={navigation.current}
            gallery={gallery}
            onHome={onHome}
            onOpenPlayground={() => onOpen("image-playground")}
            onOpenImage={(images, index) => navigation.push({ page: "viewer", images, index })}
          />
        ) : (
          <GalleryViewer
            images={route.images}
            initialIndex={route.index}
            active={navigation.current}
            onBack={navigation.pop}
          />
        )
      }
    </NavigationStack>
  );
}
