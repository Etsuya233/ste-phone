import type { ReactNode } from "react";

/** One stroke weight for page chrome and actions; no app-specific icon font. */
function BrowserIcon({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={`browser-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export function BrowserGlobeIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.9 12h16.2M12 3.8c2.2 2.3 3.3 5 3.3 8.2s-1.1 5.9-3.3 8.2c-2.2-2.3-3.3-5-3.3-8.2s1.1-5.9 3.3-8.2Z" />
    </BrowserIcon>
  );
}

export function BrowserCompassIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3 5.3-2.3Z" />
      <circle cx="12" cy="12" r="0.7" />
    </BrowserIcon>
  );
}

export function BrowserChatIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <path d="M5 5.8h14v9.8h-8.7L5 19.4V5.8Z" />
      <path d="M8.6 9.4h6.8M8.6 12.4h4.3" />
    </BrowserIcon>
  );
}

export function BrowserCodeIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <path d="m8.3 8.2-4 3.8 4 3.8M15.7 8.2l4 3.8-4 3.8M13.6 5.6l-3.2 12.8" />
    </BrowserIcon>
  );
}

export function BrowserHistoryIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <path d="M4.6 9.3A8 8 0 1 1 4 13" />
      <path d="M4.4 4.7v4.6H9" />
      <path d="M12 7.9v4.4l3 1.8" />
    </BrowserIcon>
  );
}

export function BrowserPlusIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <path d="M12 5.6v12.8M5.6 12h12.8" />
    </BrowserIcon>
  );
}

export function BrowserSparkleIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <path d="M11 4.2c.6 3.7 1.9 5 5.6 5.6-3.7.6-5 1.9-5.6 5.6-.6-3.7-1.9-5-5.6-5.6 3.7-.6 5-1.9 5.6-5.6Z" />
      <path d="M17.9 13.4c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z" />
    </BrowserIcon>
  );
}

export function BrowserCheckIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <path d="m5.5 12.3 4.2 4.2 8.8-9" />
    </BrowserIcon>
  );
}

export function BrowserStopIcon({ className }: IconProps) {
  return (
    <BrowserIcon className={className}>
      <rect x="7" y="7" width="10" height="10" rx="2.2" />
    </BrowserIcon>
  );
}
