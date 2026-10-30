import { AppIcon } from "../../system/app-icon.tsx";
import type { AppId } from "../../device/app-session.ts";
import type { MouseEvent } from "react";
import { Button } from "../../foundation/button.tsx";
import { Icon } from "../../foundation/icon.tsx";
import { Page } from "../../foundation/page.tsx";
import { Text } from "../../foundation/text.tsx";
export function Home({
  onOpen,
}: {
  onOpen: (event: MouseEvent<HTMLButtonElement>, app: AppId) => void;
}) {
  return (
    <Page
      appearance="wallpaper"
      footerHeight={112}
      footer={
        <div className="home-dock">
          <Button
            className="home-app"
            data-app="stopwatch"
            onClick={(event) => onOpen(event, "stopwatch")}
            aria-label="打开秒表"
          >
            <AppIcon app="stopwatch" />
            <Text role="caption">秒表</Text>
          </Button>
        </div>
      }
    >
      <div className="home-grid" aria-label="主屏幕">
        <Button
          className="home-app"
          data-app="database"
          onClick={(event) => onOpen(event, "database")}
          aria-label="打开 Fake DBeaver"
        >
          <AppIcon app="database" />
          <Text role="caption">Fake DBeaver</Text>
        </Button>
        <Button
          className="home-app"
          data-app="data-source"
          onClick={(event) => onOpen(event, "data-source")}
          aria-label="打开资料"
        >
          <AppIcon app="data-source" />
          <Text role="caption">资料</Text>
        </Button>
        <Button
          className="home-app"
          data-app="foundation"
          onClick={(event) => onOpen(event, "foundation")}
          aria-label="打开 Foundation 组件"
        >
          <AppIcon app="foundation" />
          <Text role="caption">组件</Text>
        </Button>
        <Button
          className="home-app"
          data-app="settings"
          onClick={(event) => onOpen(event, "settings")}
          aria-label="打开设置"
        >
          <AppIcon app="settings" />
          <Text role="caption">设置</Text>
        </Button>
      </div>
      <div className="home-page-indicator" aria-label="第 1 页，共 1 页">
        <Icon appearance="page-dot" />
      </div>
    </Page>
  );
}
