import { PhoneSettingsService } from "../apps/settings/settings-service.ts";
import type { SettingsStorage } from "../apps/settings/ports/settings-storage.ts";
import { createModelConnectionTest } from "../apps/settings/model-connection-test.ts";
import { SettingsApp } from "../apps/settings/ui/settings-app.tsx";
import { PhoneDataService } from "../apps/data-source/data-service.ts";
import type { DatabaseProvider } from "../apps/data-source/ports/database-provider.ts";
import { DataSourceApp } from "../apps/data-source/ui/data-source-app.tsx";
import { DatabaseWorkspace } from "../apps/database/database-workspace.ts";
import { DatabaseApp } from "../apps/database/ui/database-app.tsx";
import { Stopwatch } from "../apps/stopwatch/ui/stopwatch.tsx";
import { FoundationApp } from "../apps/foundation/ui/foundation-app.tsx";
import type { AiTransport } from "../core/ai/public.ts";
import type { ChatContext } from "../core/chat/public.ts";
import type { AppDefinition } from "../frontend/device/app-lifecycle.ts";
import type { AppId } from "../frontend/device/app-session.ts";
import type { DataAppPublic } from "../apps/data-source/public.ts";
import type {
  ModelConnectionsReader,
  WallpaperReader,
  HomeScreenSettings,
} from "../apps/settings/public.ts";
import { AppStore } from "../apps/app-store/ui/app-store.tsx";

export interface PhoneRuntime {
  readonly apps: Record<AppId, AppDefinition>;
  readonly wallpaper: WallpaperReader;
  readonly homeScreen: HomeScreenSettings;
  readonly modelConnections: ModelConnectionsReader;
  readonly data: DataAppPublic;
  readonly chat: ChatContext;
}

/** 生产和预览共享组装；页面、后台消费者始终使用同一数据所有者。 */
export function createPhone(dependencies: {
  settingsStorage: SettingsStorage;
  dataProvider: DatabaseProvider;
  aiTransport: AiTransport;
  chat: ChatContext;
}): PhoneRuntime {
  const settings = new PhoneSettingsService(dependencies.settingsStorage);
  const data = new PhoneDataService(dependencies.dataProvider);
  const database = new DatabaseWorkspace(data);
  const testModelConnection = createModelConnectionTest(dependencies.aiTransport);
  const apps: Record<AppId, AppDefinition> = {
    "app-store": {
      render: ({ active, onHome, onOpen }) => (
        <AppStore
          active={active}
          homeScreen={settings.homeScreen}
          onHome={onHome}
          onOpen={onOpen}
        />
      ),
    },
    settings: {
      render: ({ active, onHome }) => (
        <SettingsApp
          active={active}
          settings={settings}
          testModelConnection={testModelConnection}
          onHome={onHome}
        />
      ),
    },
    "data-source": {
      render: ({ active, onHome }) => (
        <DataSourceApp active={active} source={data} onHome={onHome} />
      ),
    },
    database: {
      render: ({ active, onHome }) => (
        <DatabaseApp active={active} database={database} onHome={onHome} />
      ),
    },
    stopwatch: {
      render: ({ active, onHome }) => <Stopwatch active={active} onExit={onHome} />,
    },
    foundation: {
      render: ({ active, onHome }) => <FoundationApp active={active} onHome={onHome} />,
    },
  };
  return {
    apps,
    wallpaper: settings.wallpaper,
    homeScreen: settings.homeScreen,
    modelConnections: settings.modelConnections,
    data,
    chat: dependencies.chat,
  };
}
