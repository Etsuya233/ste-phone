import { CampusService } from "../apps/campus-community/campus-service.ts";
import type { CampusStorage } from "../apps/campus-community/campus-domain.ts";
import { CampusApp } from "../apps/campus-community/ui/campus-app.tsx";
import { MapService } from "../apps/map/map-service.ts";
import { MapApp } from "../apps/map/ui/map-app.tsx";
import type { MapConversationStorage, MapStorage } from "../apps/map/map.ts";
import { GalleryService } from "../apps/gallery/gallery-service.ts";
import type { PhotoStorage } from "../apps/gallery/photo-storage.ts";
import type { GalleryPublic } from "../apps/gallery/public.ts";
import { GalleryContext } from "../frontend/images/gallery-context.ts";
import { GalleryApp } from "../apps/gallery/ui/gallery-app.tsx";
import { ImagePlaygroundApp } from "../apps/image-playground/ui/image-playground-app.tsx";
import { VoicePlaygroundApp } from "../apps/voice-playground/ui/voice-playground-app.tsx";
import type { SpeechTransport } from "../core/speech/public.ts";
import type { ImageHub } from "../core/image-hub/public.ts";
import { PhoneSettingsService } from "../apps/settings/settings-service.ts";
import type { SettingsStorage } from "../apps/settings/ports/settings-storage.ts";
import { createModelConnectionTest } from "../apps/settings/model-connection-test.ts";
import { SettingsApp } from "../apps/settings/ui/settings-app.tsx";
import { PhoneDataService } from "../apps/data-source/data-service.ts";
import type { DatabaseProvider } from "../apps/data-source/ports/database-provider.ts";
import type { CharacterOverrideStorage } from "../apps/data-source/ports/character-override-storage.ts";
import { DataSourceApp } from "../apps/data-source/ui/data-source-app.tsx";
import { DatabaseWorkspace } from "../apps/database/database-workspace.ts";
import { DatabaseApp } from "../apps/database/ui/database-app.tsx";
import { Stopwatch } from "../apps/stopwatch/ui/stopwatch.tsx";
import { FoundationApp } from "../apps/foundation/ui/foundation-app.tsx";
import { LogsApp } from "../apps/logs/ui/logs-app.tsx";
import type { PhoneLog } from "../apps/logs/public.ts";
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
  AppearanceSettings,
} from "../apps/settings/public.ts";
import { AppStore } from "../apps/app-store/ui/app-store.tsx";
import { WechatService } from "../apps/wechat/wechat-service.ts";
import { createWechatContextSource } from "../apps/wechat/public.ts";
import { PhoneContextService } from "../apps/phone-context/public.ts";
import { PhoneContextSettings } from "../apps/phone-context/ui/phone-context-settings.tsx";
import type { PhoneContextStorage } from "../apps/phone-context/ports/context-storage.ts";
import { WechatApp } from "../apps/wechat/ui/wechat-app.tsx";
import type { WechatStorage } from "../apps/wechat/ports/wechat-storage.ts";
import { WechatStickerLibrary } from "../apps/wechat/wechat-sticker-library.ts";
import type { WechatStickerStorage } from "../apps/wechat/wechat-stickers.ts";

export interface PhoneRuntime {
  readonly gallery: GalleryPublic;
  readonly apps: Record<AppId, AppDefinition>;
  readonly wallpaper: WallpaperReader;
  readonly homeScreen: HomeScreenSettings;
  readonly appearance: AppearanceSettings;
  readonly modelConnections: ModelConnectionsReader;
  readonly data: DataAppPublic;
  readonly chat: ChatContext;
  readonly diary: DiaryService;
  readonly wechat: WechatService;
  readonly map: MapService;
  readonly phoneContext: PhoneContextService;
}

/** 生产和预览共享组装；页面、后台消费者始终使用同一数据所有者。 */
export function createPhone(dependencies: {
  settingsStorage: SettingsStorage;
  dataProvider: DatabaseProvider;
  characterOverrides: CharacterOverrideStorage;
  matchesMemoryChat: (identity: string | null) => boolean;
  aiTransport: AiTransport;
  chat: ChatContext;
  diaryStorage: DiaryStorage;
  campusStorage: CampusStorage;
  mapStorage: MapStorage;
  mapConversations: MapConversationStorage;
  wechatStorage: WechatStorage;
  phoneContextStorage: PhoneContextStorage;
  wechatStickerStorage: WechatStickerStorage;
  logs: PhoneLog;
  photoStorage: PhotoStorage;
  imageHub: ImageHub;
  speech: SpeechTransport;
}): PhoneRuntime {
  const gallery = new GalleryService(dependencies.photoStorage, dependencies.imageHub);
  const settings = new PhoneSettingsService(dependencies.settingsStorage);
  const phoneContext = new PhoneContextService({
    chat: dependencies.chat,
    storage: dependencies.phoneContextStorage,
    sources: [createWechatContextSource(dependencies.wechatStorage)],
  });
  const data = new PhoneDataService(
    dependencies.dataProvider,
    dependencies.characterOverrides,
    dependencies.chat,
    dependencies.matchesMemoryChat,
  );
  const database = new DatabaseWorkspace(data);
  const testModelConnection = createModelConnectionTest(dependencies.aiTransport);
  const diary = new DiaryService({
    imageHub: dependencies.imageHub,
    storage: dependencies.diaryStorage,
    data,
    chat: dependencies.chat,
    connections: settings.modelConnections,
    transport: dependencies.aiTransport,
  });
  const campus = new CampusService({
    imageHub: dependencies.imageHub,
    storage: dependencies.campusStorage,
    data,
    chat: dependencies.chat,
    connections: settings.modelConnections,
    transport: dependencies.aiTransport,
  });
  const stickers = new WechatStickerLibrary(dependencies.wechatStickerStorage);
  const wechat = new WechatService({
    imageHub: dependencies.imageHub,
    stickers,
    preferences: settings.wechatPreferences,
    storage: dependencies.wechatStorage,
    data,
    chat: dependencies.chat,
    connections: settings.modelConnections,
    transport: dependencies.aiTransport,
  });
  const map = new MapService({
    storage: dependencies.mapStorage,
    conversations: dependencies.mapConversations,
    logs: dependencies.logs,
    data,
    chat: dependencies.chat,
    connections: settings.modelConnections,
    modelPreference: settings.mapModelPreference,
    transport: dependencies.aiTransport,
  });
  const apps: Record<AppId, AppDefinition> = {
    map: {
      render: ({ active, onHome }) => (
        <MapApp
          map={map}
          active={active}
          onHome={onHome}
          connections={settings.modelConnections}
          modelPreference={settings.mapModelPreference}
        />
      ),
      onQuit: () => map.cancel(),
    },
    gallery: {
      render: ({ active, onHome, onOpen }) => (
        <GalleryContext.Provider value={gallery}>
          <GalleryApp active={active} gallery={gallery} onHome={onHome} onOpen={onOpen} />
        </GalleryContext.Provider>
      ),
    },
    "image-playground": {
      render: ({ active, onHome, onOpen }) => (
        <ImagePlaygroundApp
          active={active}
          hub={dependencies.imageHub}
          onHome={onHome}
          onOpen={onOpen}
        />
      ),
    },
    "voice-playground": {
      render: ({ active, onHome, onOpen }) => (
        <VoicePlaygroundApp
          active={active}
          settings={settings}
          transport={dependencies.speech}
          onHome={onHome}
          onSettings={() => onOpen("settings")}
        />
      ),
    },
    wechat: {
      render: ({ active, onHome }) => (
        <GalleryContext.Provider value={gallery}>
          <WechatApp
            preferences={settings.wechatPreferences}
            active={active}
            wechat={wechat}
            stickers={stickers}
            onHome={onHome}
          />
        </GalleryContext.Provider>
      ),
      onQuit: () => wechat.cancel(),
    },
    "campus-community": {
      render: ({ active, onHome }) => (
        <GalleryContext.Provider value={gallery}>
          <CampusApp service={campus} active={active} onHome={onHome} />
        </GalleryContext.Provider>
      ),
      onQuitRequested: () => {
        if (!campus.canQuit()) {
          return false;
        }
        campus.stop();
        return true;
      },
      onQuit: () => campus.quit(),
    },
    diary: {
      render: ({ active, onHome }) => (
        <GalleryContext.Provider value={gallery}>
          <DiaryApp active={active} diary={diary} onHome={onHome} />
        </GalleryContext.Provider>
      ),
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
          renderPhoneContext={(props) => <PhoneContextSettings service={phoneContext} {...props} />}
          active={active}
          settings={settings}
          testModelConnection={testModelConnection}
          speech={dependencies.speech}
          onHome={onHome}
        />
      ),
    },
    "data-source": {
      render: ({ active, onHome }) => (
        <GalleryContext.Provider value={gallery}>
          <DataSourceApp active={active} source={data} onHome={onHome} />
        </GalleryContext.Provider>
      ),
    },
    logs: {
      render: ({ active, onHome }) => (
        <LogsApp active={active} logs={dependencies.logs} onHome={onHome} />
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
    gallery,
    apps,
    wallpaper: settings.wallpaper,
    homeScreen: settings.homeScreen,
    appearance: settings.appearance,
    modelConnections: settings.modelConnections,
    data,
    chat: dependencies.chat,
    diary,
    wechat,
    map,
    phoneContext,
  };
}
