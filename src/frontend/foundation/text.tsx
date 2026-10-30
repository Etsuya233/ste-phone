import type { ReactNode } from "react";
export function Text({
  children,
  role = "body",
  className = "",
}: {
  children: ReactNode;
  role?: "body" | "caption" | "display";
  className?: string;
}) {
  return <span className={`ios-text ios-text--${role} ${className}`}>{children}</span>;
}
