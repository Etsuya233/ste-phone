import { Button } from "../../../frontend/foundation/button.tsx";

/** 底部便签输入区；生成中仍可编辑，Enter 提交、Shift+Enter 换行。 */
export function PlaygroundComposer({
  value,
  generating,
  canDrawAgain,
  onChange,
  onSubmit,
  onDrawAgain,
}: {
  value: string;
  generating: boolean;
  canDrawAgain: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onDrawAgain: () => void;
}) {
  return (
    <form
      className="playground-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="playground-composer-label" htmlFor="image-description">
        描述想看的画面
      </label>
      <textarea
        id="image-description"
        value={value}
        rows={2}
        placeholder="例如：雨后街角的小小花店"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          onSubmit();
        }}
      />
      <div className="playground-composer-actions">
        <Button
          className="playground-again"
          disabled={generating || !canDrawAgain}
          onClick={onDrawAgain}
        >
          再画一张
        </Button>
        <Button
          type="submit"
          variant="filled"
          className="playground-submit"
          disabled={generating || !value.trim()}
        >
          {generating ? "正在生成…" : "生成图片"}
        </Button>
      </div>
    </form>
  );
}
