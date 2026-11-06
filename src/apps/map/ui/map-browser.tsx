import type { MapDocument, MapFeature } from "../map.ts";

const featureKinds = { place: "地点", region: "区域", road: "道路" };

export function MapSearch({
  document,
  query,
  onQuery,
  onSelect,
}: {
  document: MapDocument;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = document.features.filter((feature) =>
    [feature.name, ...feature.aliases, feature.description].some((text) =>
      text.toLocaleLowerCase().includes(normalized),
    ),
  );
  return (
    <div className="map-search">
      <div className="map-search-field">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="搜索地图"
          placeholder="搜索地点、区域或道路"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {query ? (
          <button onClick={() => onQuery("")} aria-label="清空搜索">
            ×
          </button>
        ) : null}
      </div>
      {normalized ? (
        <div className="map-search-results" aria-label="搜索结果">
          {matches.length ? (
            matches.map((feature) => (
              <button
                key={feature.id}
                onClick={() => {
                  onSelect(feature.id);
                  onQuery("");
                }}
              >
                <strong>{feature.name}</strong>
                <span>
                  {featureKinds[feature.kind]}
                  {feature.geometry ? "" : " · 位置待定"}
                </span>
              </button>
            ))
          ) : (
            <p>没有找到相关地点</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MapFeatureDetails({
  feature,
  document,
  onClose,
}: {
  feature: MapFeature;
  document: MapDocument;
  onClose: () => void;
}) {
  const events = document.events.filter((event) => event.placeIds.includes(feature.id));
  return (
    <section className="map-feature-details" aria-label="地图详情">
      <header>
        <div>
          <span className="map-caption">
            {featureKinds[feature.kind]}
            {feature.geometry ? "" : " · 位置待定"}
          </span>
          <h2>{feature.name}</h2>
        </div>
        <button aria-label="取消选择" onClick={onClose}>
          ×
        </button>
      </header>
      <p>{feature.description}</p>
      {feature.cartography?.density ? (
        <p className="map-caption">背景楼块与绿化为示意，仅用于辅助阅读地图。</p>
      ) : null}
      {feature.aliases.length ? (
        <p className="map-caption">别名：{feature.aliases.join("、")}</p>
      ) : null}
      <p className="map-caption">来源：{feature.source}</p>
      {events.map((event) => (
        <div className="map-event" key={event.id}>
          <strong>{event.title}</strong>
          <span>{event.storyTime ?? "剧情时间未知"}</span>
          <p>{event.description}</p>
          <small>来源：{event.source}</small>
        </div>
      ))}
    </section>
  );
}
