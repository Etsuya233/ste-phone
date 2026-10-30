import type { ReactNode } from "react";
export function Icon({
  children,
  className = "",
  appearance = "plain",
}: {
  children?: ReactNode;
  className?: string;
  appearance?: "plain" | "app" | "page-dot";
}) {
  return (
    <span className={`ios-icon ios-icon--${appearance} ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}
