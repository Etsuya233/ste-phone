import type { CSSProperties, ReactNode } from "react";
import { SafeArea } from "./safe-area.tsx";
export function Page({
  children,
  navBar,
  footer,
  footerHeight,
  className = "",
  appearance = "surface",
  inert = false,
}: {
  children: ReactNode;
  navBar?: ReactNode;
  className?: string;
  appearance?: "surface" | "wallpaper";
  inert?: boolean;
} & ({ footer: ReactNode; footerHeight: number } | { footer?: never; footerHeight?: never })) {
  return (
    <section
      inert={inert}
      className={`ios-page ios-page--${appearance} ${navBar ? "ios-page--nav" : ""} ${className}`}
      style={{ "--page-footer-height": footer ? `${footerHeight}px` : "0px" } as CSSProperties}
    >
      {navBar}
      <div className="ios-page-content">{children}</div>
      {footer ? <footer className="ios-footer">{footer}</footer> : null}
      <SafeArea />
    </section>
  );
}
