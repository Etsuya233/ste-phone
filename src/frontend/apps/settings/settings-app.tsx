import { useEffect, useState, useSyncExternalStore } from "react";
import { wallpaperUrl } from "../../../features/settings/phone-settings.ts";
import type {
  PhoneSettingsService,
  BackgroundImage,
  Wallpaper,
} from "../../../features/settings/phone-settings.ts";
import { NavigationStack } from "../../foundation/navigation-stack.tsx";
import { Page } from "../../foundation/page.tsx";
import { NavBar } from "../../foundation/nav-bar.tsx";
import { GroupedList } from "../../foundation/grouped-list.tsx";
import { ListCell } from "../../foundation/list-cell.tsx";
import { Button } from "../../foundation/button.tsx";
import { Switch } from "../../foundation/switch.tsx";
export function SettingsApp({
  settings,
  active,
  onHome,
}: {
  settings: PhoneSettingsService;
  active: boolean;
  onHome: () => void;
}) {
  return (
    <NavigationStack initialRoutes={["root"]} active={active}>
      {(route, navigation) =>
        route === "root" ? (
          <Page navBar={<NavBar title="设置" back={{ label: "主屏幕", onClick: onHome }} />}>
            <GroupedList title="个性化">
              <ListCell
                title="壁纸"
                subtitle="ST 背景、自定义地址与模糊"
                onClick={() => navigation.push("wallpaper")}
              />
            </GroupedList>
          </Page>
        ) : (
          <WallpaperSettings settings={settings} onBack={navigation.pop} />
        )
      }
    </NavigationStack>
  );
}
function WallpaperSettings({
  settings,
  onBack,
}: {
  settings: PhoneSettingsService;
  onBack: () => void;
}) {
  const saved = useSyncExternalStore(settings.subscribe, settings.getState);
  const [wallpaper, setWallpaper] = useState<Wallpaper>(saved.wallpaper);
  const [blur, setBlur] = useState(saved.blur);
  const [backgrounds, setBackgrounds] = useState<BackgroundImage[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [url, setUrl] = useState("");
  const [verified, setVerified] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let mounted = true;
    settings.backgrounds().then(
      (images) => {
        if (mounted) {
          setBackgrounds(images);
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (mounted) {
          setLoadError(String(error));
          setLoading(false);
        }
      },
    );
    return () => {
      mounted = false;
    };
  }, [settings, retry]);
  async function verify() {
    setMessage("");
    setVerified("");
    setChecking(true);
    try {
      const address = wallpaperUrl(url);
      await new Promise<void>((accept, reject) => {
        const image = new Image();
        image.onload = () => accept();
        image.onerror = () => reject(new Error("图片加载失败，请检查地址与访问权限"));
        image.src = address;
      });
      setVerified(address);
      setWallpaper({ kind: "image", url: address, label: "自定义壁纸" });
    } catch (error) {
      setMessage(String(error));
    } finally {
      setChecking(false);
    }
  }
  const select = (image: BackgroundImage) => {
    setWallpaper({ kind: "image", ...image });
    setMessage("");
  };
  return (
    <Page
      footerHeight={56}
      footer={
        message ? (
          <p role="status" className="settings-feedback">
            {message}
          </p>
        ) : null
      }
      navBar={
        <NavBar
          title="壁纸"
          back={{ label: "设置", onClick: onBack }}
          right={
            <Button
              disabled={checking}
              onClick={() => {
                try {
                  settings.apply({
                    ...saved,
                    wallpaper,
                    blur,
                    savedUrls:
                      verified && wallpaper.kind === "image" && wallpaper.url === verified
                        ? [...new Set([...saved.savedUrls, verified])]
                        : saved.savedUrls,
                  });
                  setMessage("已应用");
                } catch (error) {
                  setMessage(`应用失败：${String(error)}`);
                }
              }}
            >
              应用
            </Button>
          }
        />
      }
    >
      <p className="settings-message">应用后保存，返回放弃未应用的修改。</p>
      <div className="wallpaper-preview" aria-label="壁纸预览">
        <div
          className={`phone-wallpaper ${blur ? "phone-wallpaper--blur" : ""}`}
          style={
            wallpaper.kind === "image"
              ? { backgroundImage: `url(${JSON.stringify(wallpaper.url)})` }
              : undefined
          }
        />
        <span>9:41</span>
        <small>壁纸预览</small>
      </div>
      <GroupedList title="外观">
        <Switch label="模糊壁纸" checked={blur} onCheckedChange={setBlur} />
        <ListCell
          title="默认渐变"
          value={wallpaper.kind === "gradient" ? "已选择" : ""}
          onClick={() => {
            setWallpaper({ kind: "gradient" });
            setMessage("");
          }}
        />
      </GroupedList>
      <GroupedList title="自定义地址" description="先验证图片，应用后保存地址。仅影响小手机。">
        <div className="settings-url">
          <input
            type="url"
            disabled={checking}
            aria-label="壁纸图片地址"
            placeholder="https://example.com/image.jpg"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setVerified("");
            }}
          />
          <Button disabled={checking || !url} onClick={() => void verify()}>
            {checking ? "验证中…" : "验证并预览"}
          </Button>
        </div>
        {saved.savedUrls.map((address) => (
          <ListCell
            key={address}
            title="已保存的壁纸"
            subtitle={address}
            value={wallpaper.kind === "image" && wallpaper.url === address ? "已选择" : ""}
            onClick={() => select({ url: address, label: "自定义壁纸" })}
          />
        ))}
      </GroupedList>
      <GroupedList title="ST 背景" description="选择宿主已有背景；不会修改 ST 自身的背景。">
        {loading ? <p className="settings-message">正在读取背景…</p> : null}
        {loadError ? (
          <div className="settings-message">
            <p role="alert">{loadError}</p>
            <Button
              onClick={() => {
                setLoading(true);
                setLoadError("");
                setRetry((value) => value + 1);
              }}
            >
              重新读取背景
            </Button>
          </div>
        ) : null}
        {!loading && !loadError && backgrounds.length === 0 ? (
          <p className="settings-message">尚无可选背景</p>
        ) : null}
        {backgrounds.map((image) => (
          <ListCell
            key={image.url}
            title={image.label}
            value={wallpaper.kind === "image" && wallpaper.url === image.url ? "已选择" : ""}
            onClick={() => select(image)}
          />
        ))}
      </GroupedList>
    </Page>
  );
}
