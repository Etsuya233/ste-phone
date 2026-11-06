import { useEffect, useRef, type RefObject } from "react";
import * as L from "leaflet";

/** One Leaflet instance per mounted app; backgrounding never destroys the viewport. */
export function useLeafletViewport(container: RefObject<HTMLDivElement | null>, active: boolean) {
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    const map = L.map(container.current!, {
      crs: L.CRS.Simple,
      minZoom: -7,
      maxZoom: 5,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      zoomSnap: 0.1,
      zoomDelta: 0.5,
    }).setView([0, 0], 0);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(container.current!);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [container]);
  useEffect(() => {
    if (active) {
      mapRef.current!.invalidateSize({ pan: false });
    }
  }, [active]);
  return mapRef;
}
