import { useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { ImageGrid, ImageDetail } from "../../../frontend/images/image-views.tsx";

type PlaygroundRoute = { page: "create" } | { page: "detail"; image: ImageRecord };
type GenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "error"; message: string }
  | { status: "ready"; images: readonly ImageRecord[] };

export function ImagePlaygroundApp({
  active,
  hub,
  onHome,
}: {
  active: boolean;
  hub: ImageHub;
  onHome: () => void;
}) {
  return (
    <NavigationStack<PlaygroundRoute> active={active} initialRoutes={[{ page: "create" }]}>
      {(route, navigation) =>
        route.page === "create" ? (
          <PlaygroundComposer
            hub={hub}
            onHome={onHome}
            onOpen={(image) => navigation.push({ page: "detail", image })}
          />
        ) : (
          <ImageDetail image={route.image} backLabel="图乐园" onBack={navigation.pop} />
        )
      }
    </NavigationStack>
  );
}

function PlaygroundComposer({
  hub,
  onHome,
  onOpen,
}: {
  hub: ImageHub;
  onHome: () => void;
  onOpen: (image: ImageRecord) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const attached = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    attached.current = true;
    return () => {
      attached.current = false;
    };
  }, []);
  async function generate() {
    if (running.current) {
      return;
    }
    const description = prompt.trim();
    if (!description) {
      return;
    }
    running.current = true;
    setState({ status: "generating" });
    try {
      // Hub 负责参考图匹配与保存。卸载页面仅放弃结果展示，不取消 Hub 任务。
      const images = await hub.generate({ prompt: description });
      if (attached.current) {
        setState({ status: "ready", images });
      }
    } catch (error) {
      if (attached.current) {
        setState({
          status: "error",
          message: String(error instanceof Error ? error.message : error),
        });
      }
    } finally {
      running.current = false;
    }
  }
  return (
    <Page
      className="image-page"
      navBar={<NavBar title="图乐园" back={{ label: "主屏幕", onClick: onHome }} />}
    >
      <form
        className="image-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label htmlFor="image-description">描述想看的画面</label>
        <textarea
          id="image-description"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：雨后街角的小小花店"
          rows={5}
        />
        <Button
          type="submit"
          variant="filled"
          disabled={state.status === "generating" || !prompt.trim()}
        >
          {state.status === "generating" ? "正在生成…" : "生成图片"}
        </Button>
        <p className="image-note">
          参考图由 Image Hub 自动匹配。离开后仍会生成并保存，可在图库刷新查看。
        </p>
      </form>
      {state.status === "generating" ? (
        <p className="image-message" role="status">
          正在绘制画面，完成后会显示本次图片。
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="image-message" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "ready" ? (
        <section aria-label="本次生成">
          <h2 className="image-heading">本次生成</h2>
          <ImageGrid images={state.images} onOpen={onOpen} empty="本次没有返回图片。" />
        </section>
      ) : null}
    </Page>
  );
}
