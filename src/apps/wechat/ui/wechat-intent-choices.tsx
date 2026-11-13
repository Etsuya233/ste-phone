import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";

export function WechatIntentChoices({
  title,
  description,
  choices,
  selected,
  busy,
  onChange,
}: {
  title: string;
  description: string;
  choices: readonly { id: string; name: string }[];
  selected: readonly string[];
  busy: boolean;
  onChange(ids: readonly string[]): void;
}) {
  const missing = selected.filter((id) => !choices.some((choice) => choice.id === id));
  return (
    <GroupedList title={title} description={description}>
      {choices.map((choice) => (
        <ListCell
          key={choice.id}
          title={
            <label className="wechat-intent-choice">
              <input
                type="checkbox"
                checked={selected.includes(choice.id)}
                disabled={busy}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, choice.id]
                      : selected.filter((id) => id !== choice.id),
                  )
                }
              />
              <span>
                {choice.name}
                {choices.some((other) => other.id !== choice.id && other.name === choice.name) ? (
                  <small className="wechat-intent-choice-id">{choice.id}</small>
                ) : null}
              </span>
              <span className="wechat-intent-check" aria-hidden="true">
                ✓
              </span>
            </label>
          }
        />
      ))}
      {missing.map((id) => (
        <ListCell
          key={id}
          title={
            <label className="wechat-intent-choice">
              <input
                type="checkbox"
                checked
                disabled={busy}
                onChange={() => onChange(selected.filter((personId) => personId !== id))}
              />
              <span>已不在当前列表：{id}</span>
              <span className="wechat-intent-check" aria-hidden="true">
                ✓
              </span>
            </label>
          }
        />
      ))}
    </GroupedList>
  );
}
