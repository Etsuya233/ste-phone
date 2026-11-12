import { useId } from "react";
import type { ComponentPropsWithRef } from "react";

/** 与 TextField 共用分组行尺寸，原生选择器保留键盘与移动端选择体验。 */
export function SelectField({
  label,
  id,
  children,
  ...props
}: ComponentPropsWithRef<"select"> & { label: string }) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="ios-text-field ios-select-field">
      <label className="ios-text-field-label" htmlFor={selectId}>
        {label}
      </label>
      <select id={selectId} {...props}>
        {children}
      </select>
    </div>
  );
}
