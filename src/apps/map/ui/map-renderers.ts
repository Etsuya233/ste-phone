import * as L from "leaflet";

interface MapRenderers {
  surface: L.Renderer;
  fabric: L.Renderer;
  building: L.Renderer;
  roadCasing: L.Renderer;
  road: L.Renderer;
  bridge: L.Renderer;
  poi: L.Renderer;
}
const renderers = new WeakMap<L.Map, MapRenderers>();

/** Decorative fabric uses Canvas; explicit panes keep real roads and landmarks above it. */
export function mapRenderers(map: L.Map): MapRenderers {
  let result = renderers.get(map);
  if (!result) {
    for (const [name, zIndex] of [
      ["surface", 400],
      ["fabric", 410],
      ["building", 420],
      ["road-casing", 425],
      ["road", 430],
      ["bridge", 435],
      ["poi", 440],
    ] as const) {
      map.createPane(`phone-map-${name}`).style.zIndex = String(zIndex);
    }
    result = {
      surface: L.svg({ pane: "phone-map-surface" }),
      fabric: L.canvas({ pane: "phone-map-fabric", padding: 0.5 }),
      building: L.svg({ pane: "phone-map-building" }),
      roadCasing: L.svg({ pane: "phone-map-road-casing" }),
      road: L.svg({ pane: "phone-map-road" }),
      bridge: L.svg({ pane: "phone-map-bridge" }),
      poi: L.svg({ pane: "phone-map-poi" }),
    };
    // A transparent decorative Canvas must not capture clicks intended for real regions below it.
    map.getPane("phone-map-fabric")!.style.pointerEvents = "none";
    renderers.set(map, result);
  }
  return result;
}
