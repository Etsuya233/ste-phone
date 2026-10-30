import type { MouseEvent } from "react";
import { Button, Icon, Page, Text } from "../../foundation/foundation.tsx";
export function Home({ onOpen }: { onOpen: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <Page
      appearance="wallpaper"
      footer={
        <div className="home-dock">
          <Button className="home-app" onClick={onOpen} aria-label="打开秒表">
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
      <div className="home-grid" aria-label="主屏幕" />
      <div className="home-page-indicator" aria-label="第 1 页，共 1 页">
        <Icon appearance="page-dot" />
      </div>
    </Page>
  );
}
