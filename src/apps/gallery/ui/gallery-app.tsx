import { useEffect, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { ImageGrid, ImageDetail } from "../../../frontend/images/image-views.tsx";

type GalleryRoute = { page: "library" } | { page: "detail"; image: ImageRecord };
type LibraryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; images: readonly ImageRecord[] };

export function GalleryApp({
  active,
  hub,
  onHome,
}: {
  active: boolean;
  hub: ImageHub;
  onHome: () => void;
}) {
  return (
    <NavigationStack<GalleryRoute> active={active} initialRoutes={[{ page: "library" }]}>
      {(route, navigation) =>
        route.page === "library" ? (
          <GalleryLibrary
            hub={hub}
            onHome={onHome}
            onOpen={(image) => navigation.push({ page: "detail", image })}
          />
        ) : (
          <ImageDetail image={route.image} backLabel="图库" onBack={navigation.pop} />
        )
      }
    </NavigationStack>
  );
}

function GalleryLibrary({
  hub,
  onHome,
  onOpen,
}: {
  hub: ImageHub;
  onHome: () => void;
  onOpen: (image: ImageRecord) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  useEffect(() => {
    let attached = true;
    // 首次挂载与手动刷新读取，Home 保活；退出后忽略迟到的读取结果。
    void hub.listImages().then(
      (images) => {
        if (attached) {
          setState({ status: "ready", images });
        }
      },
      (error: unknown) => {
        if (attached) {
          setState({
            status: "error",
            message: String(error instanceof Error ? error.message : error),
          });
        }
      },
    );
    return () => {
      attached = false;
    };
  }, [hub, revision]);
  return (
    <Page
      className="image-page"
      navBar={
        <NavBar
          title="图库"
          back={{ label: "主屏幕", onClick: onHome }}
          right={
            <Button
              disabled={state.status === "loading"}
              onClick={() => {
                setState({ status: "loading" });
                setRevision((value) => value + 1);
              }}
            >
              刷新
            </Button>
          }
        />
      }
    >
      {state.status === "loading" ? (
        <p className="image-message" role="status">
          正在读取图片…
        </p>
      ) : state.status === "error" ? (
        <p className="image-message" role="alert">
          {state.message}
        </p>
      ) : (
        <ImageGrid
          images={state.images}
          onOpen={onOpen}
          empty="图库还没有图片。可以去图乐园生成第一张。"
        />
      )}
    </Page>
  );
}
