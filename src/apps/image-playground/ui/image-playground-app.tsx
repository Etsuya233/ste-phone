import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { ImageDetail } from "../../../frontend/images/image-views.tsx";
import { PlaygroundCanvas } from "./playground-canvas.tsx";
import { PlaygroundComposer } from "./playground-composer.tsx";
import { PlaygroundRecents } from "./playground-recents.tsx";
import { usePlayground } from "./use-playground.ts";

type PlaygroundRoute = { page: "create" } | { page: "detail"; image: ImageRecord };

/** 输入区高度：两行描述、动作行与内边距合计约 143px。 */
const FOOTER_HEIGHT = 150;

export function ImagePlaygroundApp({
  active,
  hub,
  onHome,
  onOpen,
}: {
  active: boolean;
  hub: ImageHub;
  onHome: () => void;
  onOpen: (app: "gallery") => void;
}) {
  return (
    <NavigationStack<PlaygroundRoute> active={active} initialRoutes={[{ page: "create" }]}>
      {(route, navigation) => (
        <div className="image-playground">
          {route.page === "create" ? (
            <PlaygroundPage
              hub={hub}
              active={active}
              onHome={onHome}
              onOpenGallery={() => onOpen("gallery")}
              onOpen={(image) => navigation.push({ page: "detail", image })}
            />
          ) : (
            <ImageDetail image={route.image} backLabel="图乐园" onBack={navigation.pop} />
          )}
        </div>
      )}
    </NavigationStack>
  );
}

function PlaygroundPage({
  hub,
  active,
  onHome,
  onOpenGallery,
  onOpen,
}: {
  hub: ImageHub;
  active: boolean;
  onHome: () => void;
  onOpenGallery: () => void;
  onOpen: (image: ImageRecord) => void;
}) {
  const { prompt, setPrompt, generation, recents, submit, drawAgain, reloadRecents } =
    usePlayground(hub, active);
  const recent = recents.status === "ready" ? (recents.images[0] ?? null) : null;
  return (
    <Page
      className="image-page playground-page"
      navBar={<NavBar title="图乐园" back={{ label: "主屏幕", onClick: onHome }} />}
      footerHeight={FOOTER_HEIGHT}
      footer={
        <PlaygroundComposer
          value={prompt}
          generating={generation.status === "generating"}
          canDrawAgain={generation.status === "ready" || generation.status === "error"}
          onChange={setPrompt}
          onSubmit={submit}
          onDrawAgain={drawAgain}
        />
      }
    >
      <div className="playground-stage">
        <PlaygroundCanvas
          generation={generation}
          recent={recent}
          onOpen={onOpen}
          onRetry={drawAgain}
        />
      </div>
      <PlaygroundRecents
        recents={recents}
        onOpen={onOpen}
        onOpenGallery={onOpenGallery}
        onRetry={() => void reloadRecents()}
      />
    </Page>
  );
}
