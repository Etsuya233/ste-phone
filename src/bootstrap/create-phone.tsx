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
import { DiaryService } from "../apps/diary/diary-service.ts";
import type { DiaryStorage } from "../apps/diary/ports/diary-storage.ts";
import { DiaryApp } from "../apps/diary/ui/diary-app.tsx";
import type {
  ModelConnectionsReader,
  WallpaperReader,
  HomeScreenSettings,
} from "../apps/settings/public.ts";
import { AppStore } from "../apps/app-store/ui/app-store.tsx";
import { WechatService } from "../apps/wechat/wechat-service.ts";
import { WechatApp } from "../apps/wechat/ui/wechat-app.tsx";
import type { WechatStorage } from "../apps/wechat/ports/wechat-storage.ts";
import { WechatStickerLibrary } from "../apps/wechat/wechat-sticker-library.ts";
import type { WechatStickerStorage } from "../apps/wechat/wechat-stickers.ts";

export interface PhoneRuntime {
  readonly apps: Record<AppId, AppDefinition>;
  readonly wallpaper: WallpaperReader;
  readonly homeScreen: HomeScreenSettings;
  readonly modelConnections: ModelConnectionsReader;
  readonly data: DataAppPublic;
  readonly chat: ChatContext;
  readonly diary: DiaryService;
  readonly wechat: WechatService;
}

/** 生产和预览共享组装；页面、后台消费者始终使用同一数据所有者。 */
export function createPhone(dependencies: {
  settingsStorage: SettingsStorage;
  dataProvider: DatabaseProvider;
  aiTransport: AiTransport;
  chat: ChatContext;
  diaryStorage: DiaryStorage;
  wechatStorage: WechatStorage;
  wechatStickerStorage: WechatStickerStorage;
}): PhoneRuntime {
  const settings = new PhoneSettingsService(dependencies.settingsStorage);
  const data = new PhoneDataService(dependencies.dataProvider);
  const database = new DatabaseWorkspace(data);
  const testModelConnection = createModelConnectionTest(dependencies.aiTransport);
  const diary = new DiaryService({
    storage: dependencies.diaryStorage,
    data,
    chat: dependencies.chat,
    connections: settings.modelConnections,
    transport: dependencies.aiTransport,
  });
  const stickers = new WechatStickerLibrary(dependencies.wechatStickerStorage);
  const wechat = new WechatService({
    stickers,
    storage: dependencies.wechatStorage,
    data,
    chat: dependencies.chat,
    connections: settings.modelConnections,
    transport: dependencies.aiTransport,
  });
  const apps: Record<AppId, AppDefinition> = {
    wechat: {
      render: ({ active, onHome }) => (
        <WechatApp active={active} wechat={wechat} stickers={stickers} onHome={onHome} />
      ),
      onQuit: () => wechat.cancel(),
    },
    diary: {
      render: ({ active, onHome }) => <DiaryApp active={active} diary={diary} onHome={onHome} />,
      onQuit: () => diary.quit(),
    },
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
    diary,
    wechat,
  };
}
