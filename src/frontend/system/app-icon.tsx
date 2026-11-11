import { useId } from "react";
import type { AppId } from "../device/app-session.ts";
import { Icon } from "../foundation/icon.tsx";

/**
 * 应用图标的形状。所有图形以 60 的 viewBox 绘制，视觉内容控制在 8px
 * 安全边内，保证主屏、App Store 列表和 Expose 缩放后大小一致。
 * 底色与细节样式集中在 system/app-icon.css。
 */
export function AppIcon({ app }: { app: AppId }) {
  const maskId = `app-icon-mask-${useId().replace(/:/g, "")}`;

  if (app === "map") {
    return (
      <Icon appearance="app" className="map-app-icon">
        <svg viewBox="0 0 60 60">
          <path className="map-icon-land" d="m7 13 15-4 16 6 15-5v37l-15 5-16-6-15 4Z" />
          <path className="map-icon-road" d="m7 34 15-5 16 6 15-5M22 9v37M38 15v37" />
          <path
            className="map-icon-pin"
            d="M30 12a9 9 0 0 0-9 9c0 7 9 16 9 16s9-9 9-16a9 9 0 0 0-9-9Z"
          />
          <circle className="map-icon-dot" cx="30" cy="21" r="3" />
        </svg>
      </Icon>
    );
  }
  if (app === "gallery") {
    return (
      <Icon appearance="app" className="gallery-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="10" y="12" width="40" height="36" rx="5" />
          <circle className="image-icon-cutout" cx="39" cy="23" r="4" />
          <path className="image-icon-cutout" d="m14 43 11-16 9 12 6-7 7 11Z" />
        </svg>
      </Icon>
    );
  }
  if (app === "image-playground") {
    return (
      <Icon appearance="app" className="playground-app-icon">
        <svg viewBox="0 0 60 60">
          <path d="m14 42 24-24 6 6-24 24Z" />
          <path d="m17 10 2 6 6 2-6 2-2 6-2-6-6-2 6-2Zm26 22 2 7 7 2-7 2-2 7-2-7-7-2 7-2ZM36 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
        </svg>
      </Icon>
    );
  }
  if (app === "voice-playground") {
    return (
      <Icon appearance="app" className="voice-app-icon">
        <svg
          viewBox="0 0 60 60"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        >
          <path d="M12 26v8m9-14v20m9-29v38m9-29v20m9-14v8" />
        </svg>
      </Icon>
    );
  }
  if (app === "campus-community") {
    return (
      <Icon appearance="app" className="campus-app-icon">
        <svg viewBox="0 0 60 60">
          <path d="M51 17a17 17 0 0 1-5 1.4 8.7 8.7 0 0 0 3.8-4.8 17.4 17.4 0 0 1-5.5 2.1 8.6 8.6 0 0 0-14.7 7.8A24.5 24.5 0 0 1 12 14.5a8.6 8.6 0 0 0 2.7 11.5 8.5 8.5 0 0 1-3.9-1.1v.1a8.6 8.6 0 0 0 6.9 8.4 8.6 8.6 0 0 1-3.9.2 8.6 8.6 0 0 0 8 6 17.3 17.3 0 0 1-12.7 3.6 24.4 24.4 0 0 0 37.6-20.6v-1.1A17.4 17.4 0 0 0 51 17Z" />
        </svg>
      </Icon>
    );
  }
  if (app === "wechat") {
    return (
      <Icon appearance="app" className="wechat-app-icon">
        <svg viewBox="0 0 60 60">
          <path d="M24 12.5C15.3 12.5 8.5 18.4 8.5 25.8c0 4 1.9 7.6 4.9 10L12 42.2l7-3.4c1.6.4 3.3.6 5 .6 8.7 0 15.5-5.9 15.5-13.3S32.7 12.5 24 12.5Z" />
          <path d="M38.5 26.5c-6.3 0-11 4.3-11 9.8 0 2.9 1.3 5.5 3.3 7.3l-1.1 4.2 5.2-2.5c1.2.3 2.4.5 3.6.5 6.3 0 11-4.3 11-9.8s-4.7-9.5-11-9.5Z" />
          <circle className="wechat-dot" cx="19" cy="25.5" r="1.9" />
          <circle className="wechat-dot" cx="28" cy="25.5" r="1.9" />
          <circle className="wechat-dot" cx="34.5" cy="36.5" r="1.6" />
          <circle className="wechat-dot" cx="41.5" cy="36.5" r="1.6" />
        </svg>
      </Icon>
    );
  }
  if (app === "app-store") {
    return (
      <Icon appearance="app" className="app-store-icon">
        <svg viewBox="0 0 60 60">
          <path d="M14 22h32v26a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V22Z" />
          <path className="store-handle" d="M22 22v-5a8 8 0 0 1 16 0v5" />
        </svg>
      </Icon>
    );
  }
  if (app === "diary") {
    return (
      <Icon appearance="app" className="diary-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="14" y="9" width="29" height="42" rx="3.5" />
          <rect className="diary-spine" x="14" y="9" width="5" height="42" rx="2.5" />
          <rect className="diary-pages" x="43" y="13" width="3.5" height="34" rx="1.75" />
          <path className="diary-ribbon" d="M33 9h6v16l-3-2.4-3 2.4V9Z" />
        </svg>
      </Icon>
    );
  }
  if (app === "stopwatch") {
    return (
      <Icon appearance="app" className="stopwatch-icon">
        <svg viewBox="0 0 60 60">
          <rect x="26.5" y="8" width="7" height="6" rx="2" />
          <rect x="28" y="13" width="4" height="6" />
          <path className="stopwatch-button" d="m43.5 18.5 4.5 4.5" />
          <circle cx="30" cy="35.5" r="16.5" />
          <circle className="stopwatch-face" cx="30" cy="35.5" r="12" />
          <path className="stopwatch-hand" d="M30 35.5V26" />
          <path className="stopwatch-second" d="m30 35.5 7.5 5.5" />
          <circle className="stopwatch-pin" cx="30" cy="35.5" r="2.2" />
        </svg>
      </Icon>
    );
  }
  if (app === "database") {
    return (
      <Icon appearance="app" className="database-app-icon">
        <svg viewBox="0 0 60 60">
          <path d="M30 10c9.4 0 17 3.1 17 7v26c0 7-7.6 12-17 12s-17-5-17-12V17c0-3.9 7.6-7 17-7Z" />
          <path className="database-ring" d="M13 17c0 3.9 7.6 7 17 7s17-3.1 17-7" />
          <path className="database-ring" d="M13 28c0 3.9 7.6 7 17 7s17-3.1 17-7" />
          <path className="database-ring" d="M13 39c0 3.9 7.6 7 17 7s17-3.1 17-7" />
        </svg>
      </Icon>
    );
  }
  if (app === "data-source") {
    return (
      <Icon appearance="app" className="data-app-icon">
        <svg viewBox="0 0 60 60">
          <rect className="data-card" x="17" y="11" width="29" height="34" rx="3" opacity=".45" />
          <rect className="data-card" x="15" y="15" width="29" height="34" rx="3" opacity=".7" />
          <rect className="data-card" x="13" y="19" width="29" height="32" rx="3" />
          <circle className="data-mark" cx="27.5" cy="30" r="4" />
          <path className="data-mark-line" d="M20.5 40c0-4 3.1-6.5 7-6.5s7 2.5 7 6.5" />
        </svg>
      </Icon>
    );
  }
  if (app === "logs") {
    return (
      <Icon appearance="app" className="logs-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="12" y="10" width="36" height="40" rx="5" />
          <path className="logs-terminal-mark" d="m19 22 6 6-6 6M29 36h12" />
        </svg>
      </Icon>
    );
  }
  if (app === "foundation") {
    return (
      <Icon appearance="app" className="foundation-app-icon">
        <svg viewBox="0 0 60 60">
          <rect x="11" y="11" width="17" height="17" rx="3.5" />
          <rect x="32" y="11" width="17" height="17" rx="3.5" opacity=".8" />
          <rect x="11" y="32" width="17" height="17" rx="3.5" opacity=".8" />
          <rect x="32" y="32" width="17" height="17" rx="3.5" opacity=".55" />
        </svg>
      </Icon>
    );
  }
  if (app === "settings") {
    return (
      <Icon appearance="app" className="settings-app-icon">
        <svg viewBox="0 0 60 60">
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="60" height="60">
              <rect width="60" height="60" fill="white" />
              <circle cx="30" cy="30" r="5.5" fill="black" />
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>
            <circle cx="30" cy="30" r="13" />
            <rect x="27" y="9" width="6" height="8" rx="1.5" />
            <rect x="27" y="9" width="6" height="8" rx="1.5" transform="rotate(60 30 30)" />
            <rect x="27" y="9" width="6" height="8" rx="1.5" transform="rotate(120 30 30)" />
            <rect x="27" y="9" width="6" height="8" rx="1.5" transform="rotate(180 30 30)" />
            <rect x="27" y="9" width="6" height="8" rx="1.5" transform="rotate(240 30 30)" />
            <rect x="27" y="9" width="6" height="8" rx="1.5" transform="rotate(300 30 30)" />
          </g>
        </svg>
      </Icon>
    );
  }
}
