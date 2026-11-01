import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PhoneSettingsService, Wallpaper, WallpaperImage } from "../settings-service.ts";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import type { ModelConnection } from "../model-connections.ts";
import type { TestModelConnection } from "../model-connection-test.ts";
import { ModelConnections, ModelConnectionEditor } from "./model-connections.tsx";

type SettingsRoute =
  | { page: "root" }
  | { page: "wallpapers" }
  | { page: "preview"; wallpaper: Wallpaper }
  | { page: "connections" }
  | { page: "connection-editor"; connection: ModelConnection | null };
export function SettingsApp({
  settings,
  testModelConnection,
  active,
  onHome,
}: {
  settings: PhoneSettingsService;
  testModelConnection: TestModelConnection;
  active: boolean;
  onHome: () => void;
}) {
  return (
    <NavigationStack<SettingsRoute> initialRoutes={[{ page: "root" }]} active={active}>
      {(route, navigation) =>
        route.page === "root" ? (
          <Page navBar={<NavBar title="设置" back={{ label: "主屏幕", onClick: onHome }} />}>
            <GroupedList>
              <ListCell title="壁纸" onClick={() => navigation.push({ page: "wallpapers" })} />
              <ListCell title="模型连接" onClick={() => navigation.push({ page: "connections" })} />
            </GroupedList>
          </Page>
        ) : route.page === "wallpapers" ? (
          <WallpaperLibrary settings={settings} navigation={navigation} />
        ) : route.page === "connections" ? (
          <ModelConnections
            settings={settings}
            onBack={navigation.pop}
            onEdit={(connection) => navigation.push({ page: "connection-editor", connection })}
          />
        ) : route.page === "connection-editor" ? (
          <ModelConnectionEditor
            settings={settings}
            connection={route.connection}
            testModelConnection={testModelConnection}
            current={navigation.current}
            onBack={navigation.pop}
          />
        ) : (
          <WallpaperPreview
            settings={settings}
            wallpaper={route.wallpaper}
            onBack={navigation.pop}
          />
        )
      }
    </NavigationStack>
  );
}
function WallpaperLibrary({
  settings,
  navigation,
}: {
  settings: PhoneSettingsService;
  navigation: Navigation<SettingsRoute>;
}) {
  const saved = useSyncExternalStore(settings.subscribe, settings.getState);
  const [images, setImages] = useState<WallpaperImage[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [retryList, setRetryList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<WallpaperImage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    settings.listWallpapers().then(
      (result) => {
        if (current) {
          setImages((previous) => [
            ...previous.filter((image) => !result.some((next) => next.path === image.path)),
            ...result,
          ]);
          setLoading(false);
        }
      },
      (failure: unknown) => {
        if (current) {
          setError(failure instanceof Error ? failure.message : String(failure));
          setRetryList(true);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [settings, retry]);
  useEffect(() => {
    if (uploaded && navigation.current) {
      navigation.push({ page: "preview", wallpaper: { kind: "image", path: uploaded.path } });
      setUploaded(null);
    }
  }, [uploaded, navigation]);
  async function upload(file: File) {
    setError("");
    setRetryList(false);
    setUploading(true);
    const temporaryUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = temporaryUrl;
      try {
        await image.decode();
      } catch {
        throw new Error("无法读取这张图片");
      }
      const result = await settings.uploadWallpaper(file);
      if (mounted.current) {
        setImages((previous) => [result, ...previous]);
        setUploaded(result);
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    } finally {
      URL.revokeObjectURL(temporaryUrl);
      if (mounted.current) {
        setUploading(false);
      }
    }
  }
  return (
    <Page
      className="wallpaper-library"
      navBar={
        <NavBar
          title="壁纸"
          back={{ label: "设置", onClick: navigation.pop }}
          right={
            <Button
              className="wallpaper-add"
              aria-label="上传壁纸"
              disabled={uploading}
              aria-busy={uploading}
              onClick={() => input.current!.click()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v16M4 12h16" />
              </svg>
            </Button>
          }
        />
      }
    >
      <input
        ref={input}
        className="wallpaper-file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files![0];
          event.target.value = "";
          if (file) {
            void upload(file);
          }
        }}
      />
      {error ? (
        <div className="wallpaper-error">
          <p role="alert">{error}</p>
          {retryList && !uploading ? (
            <Button
              onClick={() => {
                setError("");
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              重试
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="wallpaper-grid" aria-label="壁纸图库" aria-busy={loading || uploading}>
        <button
          className="wallpaper-thumbnail"
          aria-label="默认渐变"
          aria-pressed={saved.wallpaper.kind === "gradient"}
          onClick={() => navigation.push({ page: "preview", wallpaper: { kind: "gradient" } })}
        >
          <span className="phone-wallpaper" />
          <span className="wallpaper-selection" aria-hidden="true">
            ✓
          </span>
        </button>
        {images.map((image, index) => (
          <button
            className="wallpaper-thumbnail"
            key={image.path}
            aria-label={`壁纸 ${index + 1}`}
            aria-pressed={saved.wallpaper.kind === "image" && saved.wallpaper.path === image.path}
            onClick={() =>
              navigation.push({ page: "preview", wallpaper: { kind: "image", path: image.path } })
            }
          >
            <img
              src={image.url}
              alt=""
              onError={() => {
                setError("图片读取失败");
                setRetryList(false);
              }}
            />
            <span className="wallpaper-selection" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>
    </Page>
  );
}
function WallpaperPreview({
  settings,
  wallpaper,
  onBack,
}: {
  settings: PhoneSettingsService;
  wallpaper: Wallpaper;
  onBack: () => void;
}) {
  const saved = useSyncExternalStore(settings.subscribe, settings.getState);
  const [blur, setBlur] = useState(saved.blur);
  const [error, setError] = useState("");
  const url = settings.imageUrl(wallpaper);
  return (
    <Page
      className="wallpaper-preview-page"
      navBar={
        <NavBar
          title="预览"
          back={{ label: "壁纸", onClick: onBack }}
          right={
            <Button
              onClick={() => {
                try {
                  settings.setWallpaper(wallpaper, blur);
                  onBack();
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : String(failure));
                }
              }}
            >
              设定
            </Button>
          }
        />
      }
      footerHeight={error ? 100 : 64}
      footer={
        <div className="wallpaper-preview-controls">
          {error ? (
            <p className="wallpaper-save-error" role="alert">
              {error}
            </p>
          ) : null}
          <Switch label="Blur" checked={blur} onCheckedChange={setBlur} />
        </div>
      }
    >
      <div
        className={`phone-wallpaper ${blur ? "phone-wallpaper--blur" : ""}`}
        style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
      />
    </Page>
  );
}
