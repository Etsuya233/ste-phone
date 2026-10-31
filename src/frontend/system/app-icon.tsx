import type { AppId } from "../device/app-session.ts";
import { Icon } from "../foundation/icon.tsx";

export function AppIcon({ app }: { app: AppId }) {
  if (app === "diary")
    return (
      <Icon appearance="app" className="diary-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="13" y="9" width="35" height="43" rx="4" />
          <path d="M21 9v43M28 22h13M28 30h13M28 38h9M10 19h6M10 30h6M10 41h6" />
        </svg>
      </Icon>
    );
  if (app === "stopwatch")
    return (
      <Icon appearance="app" className="stopwatch-icon">
        <svg viewBox="0 0 60 60">
          <path d="M25 8h10M30 8v6M43 15l4 4" />
          <circle cx="30" cy="35" r="18" />
          <path d="M30 35V22M30 35l8 5" />
          <circle className="stopwatch-pin" cx="30" cy="35" r="2" />
        </svg>
      </Icon>
    );
  if (app === "database")
    return (
      <Icon appearance="app" className="database-app-icon">
        <svg viewBox="0 0 60 60">
          <ellipse cx="30" cy="15" rx="17" ry="7" />
          <path d="M13 15v28c0 9 34 9 34 0V15M13 28c0 9 34 9 34 0M13 40c0 9 34 9 34 0" />
        </svg>
      </Icon>
    );
  if (app === "data-source")
    return (
      <Icon appearance="app" className="data-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="13" y="10" width="34" height="40" rx="4" />
          <path d="M21 21h18M21 30h18M21 39h12" />
        </svg>
      </Icon>
    );
  if (app === "foundation")
    return (
      <Icon appearance="app" className="foundation-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="12" y="12" width="15" height="15" rx="3" />
          <rect x="33" y="12" width="15" height="15" rx="3" />
          <rect x="12" y="33" width="15" height="15" rx="3" />
          <rect x="33" y="33" width="15" height="15" rx="3" />
        </svg>
      </Icon>
    );
  if (app === "settings")
    return (
      <Icon appearance="app" className="settings-app-icon">
        <svg viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="18" />
          <circle cx="30" cy="30" r="8" />
          <path d="M30 6v8M30 46v8M6 30h8M46 30h8M13 13l6 6M41 41l6 6M13 47l6-6M41 19l6-6" />
        </svg>
      </Icon>
    );
}
