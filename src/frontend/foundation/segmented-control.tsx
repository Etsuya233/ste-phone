import { useId } from "react";
export function SegmentedControl<Value extends string>({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly { value: Value; label: string; disabled?: boolean }[];
}) {
  const name = useId();
  return (
    <fieldset className="ios-segmented">
      <legend>{label}</legend>
      <div className="ios-segmented-options">
        {options.map((option) => (
          <label key={option.value} className="ios-segment">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onValueChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
