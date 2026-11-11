import type { ReactNode } from "react";

/** 应用内动作图标统一使用 24 视口和 currentColor，尺寸交给外层 CSS。 */
function Svg({ children, viewBox = "0 0 24 24" }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {children}
    </svg>
  );
}

export function HomeIcon() {
  return (
    <Svg>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1Z" />
    </Svg>
  );
}

export function FollowingIcon() {
  return (
    <Svg>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.5-3.4 2.6-5.4 5.5-5.4s5 2 5.5 5.4" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.8c1.6.7 2.7 2.4 3 5" />
    </Svg>
  );
}

export function PersonIcon() {
  return (
    <Svg>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.3 20c.7-3.4 3.4-5.4 6.7-5.4s6 2 6.7 5.4" />
    </Svg>
  );
}

export function CommentIcon() {
  return (
    <Svg>
      <path d="M20 11.5c0 4-3.6 7.2-8 7.2-1 0-2-.2-2.9-.5L5 20l1-3.7A6.7 6.7 0 0 1 4 11.5c0-4 3.6-7.2 8-7.2s8 3.2 8 7.2Z" />
    </Svg>
  );
}

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Svg>
      <path
        d="M12 20c-4.8-3.2-8-6.2-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 3.8-3.2 6.8-8 10Z"
        fill={filled ? "currentColor" : "none"}
      />
    </Svg>
  );
}

export function SparkleIcon() {
  return (
    <Svg>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
      <path d="M19 16.5v3M17.5 18h3" />
    </Svg>
  );
}

export function MoreIcon() {
  return (
    <Svg>
      <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PlusIcon() {
  return (
    <Svg>
      <path d="M12 4v16M4 12h16" />
    </Svg>
  );
}

export function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <Svg viewBox="0 0 12 22">
      <path d={direction === "left" ? "m10 2-8 9 8 9" : "m2 2 8 9-8 9"} />
    </Svg>
  );
}

export function ImageIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m5.5 17 4.2-4.4 3.2 3.2 2.4-2.4 3.2 3.6" />
    </Svg>
  );
}
