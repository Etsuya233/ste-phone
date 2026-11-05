import type { CSSProperties, ReactNode } from "react";
import { SafeArea } from "./safe-area.tsx";
export function Page({
  children,
  navBar,
  largeTitle,
  footer,
  footerHeight,
  footerLayout = "attached",
  className = "",
  appearance = "surface",
  inert = false,
}: {
  children: ReactNode;
  navBar?: ReactNode;
  largeTitle?: string;
  className?: string;
  appearance?: "surface" | "wallpaper";
  inert?: boolean;
} & (
  | { footer: ReactNode; footerHeight: number; footerLayout?: "attached" | "floating" }
  | { footer?: never; footerHeight?: never; footerLayout?: never }
)) {
  return (
    <section
      inert={inert}
      className={`ios-page ios-page--${appearance} ${navBar ? "ios-page--nav" : ""} ${largeTitle ? "ios-page--large-title" : ""} ${className}`}
      style={{ "--page-footer-height": footer ? `${footerHeight}px` : "0px" } as CSSProperties}
    >
      {navBar}
      <div className="ios-page-content">
        {largeTitle ? <h1 className="ios-page-large-title">{largeTitle}</h1> : null}
        {children}
      </div>
      {footer ? (
        <footer className={`ios-footer ios-footer--${footerLayout}`}>{footer}</footer>
      ) : null}
      {/* Attached footers paint through the safe area while their controls stay above it. */}
      {!footer || footerLayout === "floating" ? <SafeArea /> : null}
    </section>
  );
}
