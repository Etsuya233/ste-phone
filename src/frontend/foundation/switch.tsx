import { useId } from "react";
export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={`ios-switch ${disabled ? "ios-switch--disabled" : ""}`} htmlFor={id}>
      <span>{label}</span>
      <span className="ios-switch-control">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span className="ios-switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}
