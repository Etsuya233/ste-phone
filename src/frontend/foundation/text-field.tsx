import { useId } from "react";
import type { ComponentPropsWithRef, ReactNode } from "react";

export function TextField({
  label,
  accessory,
  id,
  ...props
}: ComponentPropsWithRef<"input"> & { label: string; accessory?: ReactNode }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="ios-text-field">
      <label className="ios-text-field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="ios-text-field-controls">
        <input id={inputId} {...props} />
        {accessory}
      </div>
    </div>
  );
}
