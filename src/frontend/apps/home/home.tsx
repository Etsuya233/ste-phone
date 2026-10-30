import type { MouseEvent } from "react";
import { Button } from "../../foundation/button.tsx";
import { Icon } from "../../foundation/icon.tsx";
import { Page } from "../../foundation/page.tsx";
import { Text } from "../../foundation/text.tsx";
export function Home({
  onOpen,
}: {
  onOpen: (
    event: MouseEvent<HTMLButtonElement>,
    app: "stopwatch" | "foundation" | "data-source",
  ) => void;
}) {
  return (
    <Page
      appearance="wallpaper"
      footerHeight={112}
      footer={
        <div className="home-dock">
          <Button
            className="home-app"
            onClick={(event) => onOpen(event, "stopwatch")}
            aria-label="打开秒表"
          >
            <Icon appearance="app" className="stopwatch-icon">
              <svg viewBox="0 0 60 60">
                <path d="M25 8h10M30 8v6M43 15l4 4" />
                <circle cx="30" cy="35" r="18" />
                <path d="M30 35V22M30 35l8 5" />
                <circle className="stopwatch-pin" cx="30" cy="35" r="2" />
              </svg>
            </Icon>
            <Text role="caption">秒表</Text>
          </Button>
        </div>
      }
    >
      <div className="home-grid" aria-label="主屏幕">
        <Button
          className="home-app"
          data-app="data-source"
          onClick={(event) => onOpen(event, "data-source")}
          aria-label="打开资料"
        >
          <Icon appearance="app" className="data-app-icon">
            <svg viewBox="0 0 60 60">
              <rect x="13" y="10" width="34" height="40" rx="4" />
              <path d="M21 21h18M21 30h18M21 39h12" />
            </svg>
          </Icon>
          <Text role="caption">资料</Text>
        </Button>
        <Button
          className="home-app"
          data-app="foundation"
          onClick={(event) => onOpen(event, "foundation")}
          aria-label="打开 Foundation 组件"
        >
          <Icon appearance="app" className="foundation-app-icon">
            <svg viewBox="0 0 60 60">
              <rect x="12" y="12" width="15" height="15" rx="3" />
              <rect x="33" y="12" width="15" height="15" rx="3" />
              <rect x="12" y="33" width="15" height="15" rx="3" />
              <rect x="33" y="33" width="15" height="15" rx="3" />
            </svg>
          </Icon>
          <Text role="caption">组件</Text>
        </Button>
      </div>
      <div className="home-page-indicator" aria-label="第 1 页，共 1 页">
        <Icon appearance="page-dot" />
      </div>
    </Page>
  );
}
