import { createContext, useContext } from "react";
import type { GalleryPublic } from "../../apps/gallery/public.ts";

export const GalleryContext = createContext<GalleryPublic | null>(null);

export function useGallery(): GalleryPublic {
  const gallery = useContext(GalleryContext);
  if (!gallery) {
    throw new Error("图库未接入当前应用");
  }
  return gallery;
}
