import type { ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { GenerationState } from "./use-playground.ts";
import { PlaygroundPolaroid } from "./playground-polaroid.tsx";

/** 画布一次只呈现一种阶段：本次结果、生成中、失败，或空闲时的最近一张。 */
export function PlaygroundCanvas({
  generation,
  recent,
  onOpen,
  onRetry,
}: {
  generation: GenerationState;
  recent: ImageRecord | null;
  onOpen: (image: ImageRecord) => void;
  onRetry: () => void;
}) {
  if (generation.status === "ready") {
    return (
      <section className="playground-result" aria-label="本次生成">
        <h2 className="playground-canvas-heading">刚刚画好</h2>
        {generation.images.length > 0 ? (
          <div className="playground-polaroid-grid">
            {generation.images.map((image) => (
              <PlaygroundPolaroid key={image.id} image={image} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="playground-canvas-note" role="status">
            这次没有返回图片，可以换一种描述再画。
          </p>
        )}
      </section>
    );
  }
  if (generation.status === "generating") {
    return (
      <section className="playground-developing" role="status">
        <h2 className="playground-canvas-heading">正在显影</h2>
        <p className="playground-developing-prompt">「{generation.prompt}」</p>
        <div className="playground-developing-sheet" aria-hidden="true" />
        <p className="playground-developing-note">离开手机也会继续画，画好后仍会保存在图库。</p>
      </section>
    );
  }
  if (generation.status === "error") {
    return (
      <section className="playground-failure" role="alert">
        <h2 className="playground-canvas-heading">这张没画成</h2>
        <p className="playground-failure-prompt">「{generation.prompt}」</p>
        <p className="playground-failure-message">{generation.message}</p>
        <Button variant="filled" onClick={onRetry}>
          重试
        </Button>
      </section>
    );
  }
  if (recent) {
    return (
      <section className="playground-latest" aria-label="最近一张">
        <h2 className="playground-canvas-heading">最近一张</h2>
        <div className="playground-latest-card">
          <PlaygroundPolaroid image={recent} onOpen={onOpen} />
        </div>
      </section>
    );
  }
  return (
    <section className="playground-empty">
      <p className="playground-empty-tag">画布</p>
      <h2>还没开始画</h2>
      <p className="playground-empty-copy">在下方写下想看的画面，第一张相纸会摆在这里。</p>
      <p className="playground-empty-note">参考图由 Image Hub 自动匹配；离开后仍会生成并保存。</p>
    </section>
  );
}
