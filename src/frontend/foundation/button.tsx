import type { ComponentPropsWithRef } from "react";
export function Button({
  variant = "plain",
  className = "",
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & {
  variant?: "plain" | "filled" | "danger" | "start" | "stop" | "reset";
}) {
  return (
    <button type={type} className={`ios-button ios-button--${variant} ${className}`} {...props} />
  );
}
