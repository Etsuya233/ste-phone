import type { ComponentPropsWithRef, ReactNode } from "react";
export function Button({
  variant = "plain",
  className = "",
  ...props
}: ComponentPropsWithRef<"button"> & { variant?: "plain" | "start" | "stop" | "reset" }) {
  return <button className={`ios-button ios-button--${variant} ${className}`} {...props} />;
}
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
export function Page({
  children,
  title,
  onBack,
  footer,
  className = "",
  appearance = "surface",
}: {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  footer?: ReactNode;
  className?: string;
  appearance?: "surface" | "wallpaper";
}) {
  return (
    <section
      className={`ios-page ios-page--${appearance} ${title ? "ios-page--nav" : ""} ${footer ? "ios-page--footer" : ""} ${className}`}
    >
      {title ? (
        <header className="ios-nav">
          <Button onClick={onBack} aria-label="返回主屏幕">
            <Icon>
              <svg viewBox="0 0 12 22">
                <path d="m10 2-8 9 8 9" />
              </svg>
            </Icon>
            返回
          </Button>
          <h1>{title}</h1>
        </header>
      ) : null}
      <div className="ios-page-content">{children}</div>
      {footer ? <footer className="ios-footer">{footer}</footer> : null}
    </section>
  );
}
