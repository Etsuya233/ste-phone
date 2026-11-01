import { useState, useSyncExternalStore } from "react";
import { appCatalog } from "../../../core/launcher/catalog.ts";
import type { AppId } from "../../../core/launcher/catalog.ts";
import type { HomeScreenSettings } from "../../settings/public.ts";
import { AppIcon } from "../../../frontend/system/app-icon.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";

export function AppStore({
  active,
  homeScreen,
  onHome,
  onOpen,
}: {
  active: boolean;
  homeScreen: HomeScreenSettings;
  onHome: () => void;
  onOpen: (app: AppId) => void;
}) {
  const layout = useSyncExternalStore(homeScreen.subscribe, homeScreen.getSnapshot);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const installed = new Set([...layout.grid, ...layout.dock]);
  const query = search.trim().toLocaleLowerCase();
  const apps = (Object.keys(appCatalog) as AppId[]).filter(
    (id) =>
      id !== "app-store" &&
      `${appCatalog[id].name} ${appCatalog[id].description}`.toLocaleLowerCase().includes(query),
  );
  return (
    <>
      <Page
        className="app-store"
        inert={error !== null}
        navBar={<NavBar title="App Store" back={{ label: "主屏幕", onClick: onHome }} />}
      >
        <div className="store-search">
          <input
            type="search"
            aria-label="搜索应用"
            placeholder="搜索应用"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ul className="store-list" aria-label="应用列表">
          {apps.map((id) => (
            <li key={id} className="store-row">
              <AppIcon app={id} />
              <div className="store-details">
                <h2>{appCatalog[id].name}</h2>
                <p>{appCatalog[id].description}</p>
                <span>{appCatalog[id].removable ? "工具" : "系统应用"}</span>
              </div>
              <Button
                className="store-action"
                aria-label={`${installed.has(id) ? "打开" : "获取"}${appCatalog[id].name}`}
                onClick={() => {
                  if (installed.has(id)) {
                    onOpen(id);
                  } else {
                    try {
                      homeScreen.install(id);
                    } catch (cause) {
                      setError((cause as Error).message);
                    }
                  }
                }}
              >
                {installed.has(id) ? "打开" : "获取"}
              </Button>
            </li>
          ))}
        </ul>
        {apps.length === 0 ? (
          <p className="store-empty" role="status">
            没有找到相关应用
          </p>
        ) : null}
      </Page>
      {error !== null ? (
        <Alert
          title="安装失败"
          active={active}
          onDismiss={() => setError(null)}
          actions={[{ label: "好", onClick: () => setError(null) }]}
        >
          {error}
        </Alert>
      ) : null}
    </>
  );
}
