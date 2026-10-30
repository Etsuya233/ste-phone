import type { ReactNode } from "react";
export function ListCell({
  title,
  subtitle,
  value,
  accessory,
  onClick,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  value?: string;
} & (
  | { onClick: () => void; disabled?: boolean; accessory?: never }
  | { onClick?: never; disabled?: never; accessory?: ReactNode }
)) {
  const content = (
    <>
      <span className="ios-cell-copy">
        <span className="ios-cell-title">{title}</span>
        {subtitle ? <span className="ios-cell-subtitle">{subtitle}</span> : null}
      </span>
      {value ? <span className="ios-cell-value">{value}</span> : null}
      {accessory ? <span className="ios-cell-accessory">{accessory}</span> : null}
      {onClick ? (
        <span className="ios-cell-chevron" aria-hidden="true">
          ›
        </span>
      ) : null}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="ios-cell ios-cell--action"
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className="ios-cell">{content}</div>
  );
}
