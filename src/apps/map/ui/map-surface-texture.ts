import type * as L from "leaflet";
import type { MapFeature } from "../map.ts";
import { landuseColors } from "./map-feature-style.ts";

const namespace = "http://www.w3.org/2000/svg";
const patterns = new WeakMap<SVGSVGElement, Map<string, string>>();
let nextPattern = 0;

/** Repeating surface marks are cartographic texture; they carry no place or road identities. */
export function addSurfaceTexture(layer: L.Path, feature: MapFeature): void {
  const landuse = feature.cartography?.landuse;
  const texture = feature.terrain === "water" ? "water" : landuse;
  if (!texture || !["water", "farmland", "meadow", "sand", "rock", "forest"].includes(texture)) {
    return;
  }
  const path = layer.getElement() as SVGPathElement;
  const svg = path.ownerSVGElement!;
  let definitions = patterns.get(svg);
  if (!definitions) {
    definitions = new Map();
    patterns.set(svg, definitions);
  }
  let id = definitions.get(texture);
  if (!id) {
    id = `phone-map-texture-${nextPattern++}`;
    definitions.set(texture, id);
    const defs = document.createElementNS(namespace, "defs");
    const pattern = document.createElementNS(namespace, "pattern");
    pattern.setAttribute("id", id);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    const size = texture === "water" ? 38 : texture === "farmland" ? 9 : 18;
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));
    const background = document.createElementNS(namespace, "rect");
    background.setAttribute("width", String(size));
    background.setAttribute("height", String(size));
    background.setAttribute("fill", texture === "water" ? "#9ecbd5" : landuseColors[landuse!]);
    const mark = document.createElementNS(namespace, "path");
    const strokes = {
      water: "M7 19q4 -2 8 0t8 0",
      farmland: "M0 0H9",
      meadow: "M4 5l1 -2 1 2M13 14l1 -2 1 2",
      sand: "M3 4h1M11 12h1",
      rock: "M4 4l3 -1 2 3M11 14l3 -2",
      forest: "M4 7l2 -3 2 3M12 16l2 -3 2 3",
    };
    mark.setAttribute("d", strokes[texture as keyof typeof strokes]);
    mark.setAttribute("fill", "none");
    mark.setAttribute(
      "stroke",
      texture === "water" ? "#c4e0e2" : texture === "rock" ? "#bbb5a8" : "#b5c29c",
    );
    mark.setAttribute("stroke-width", texture === "water" ? "0.8" : "0.6");
    mark.setAttribute("opacity", "0.5");
    pattern.append(background, mark);
    defs.append(pattern);
    svg.prepend(defs);
  }
  path.setAttribute("fill", `url(#${id})`);
}
