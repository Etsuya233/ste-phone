/** 阅读页和大图页共用的紧凑文字操作；移除确认由调用页面持有。 */
export function DiaryImageActions({
  busy,
  onPick,
  onPrompt,
  onRemove,
}: {
  busy: boolean;
  onPick: () => void;
  onPrompt: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="diary-image-actions">
      <button type="button" className="diary-image-action" disabled={busy} onClick={onPick}>
        更换配图
      </button>
      <button type="button" className="diary-image-action" disabled={busy} onClick={onPrompt}>
        调整描述
      </button>
      {onRemove ? (
        <button
          type="button"
          className="diary-image-action diary-image-action--danger"
          disabled={busy}
          onClick={onRemove}
        >
          移除
        </button>
      ) : null}
    </div>
  );
}
