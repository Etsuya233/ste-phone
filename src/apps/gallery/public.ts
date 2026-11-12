import type { ImageRecord } from "../../core/image-hub/public.ts";

export const gallerySourceLabels = { phone: "手机图库", hub: "Image Hub" } as const;
export type GallerySource = keyof typeof gallerySourceLabels;
export type GalleryFilter = GallerySource | "all";

export interface GalleryImageReference {
  readonly source: GallerySource;
  readonly id: string;
  readonly imagePath: string;
}

export interface GalleryImage extends GalleryImageReference {
  readonly savedAt: string;
  readonly description?: string;
  readonly generation?: { readonly prompt: string; readonly startedAt: string };
}

export interface GalleryBrowseResult {
  readonly images: readonly GalleryImage[];
  readonly errors: readonly { source: GallerySource; message: string }[];
}

export interface GalleryPublic {
  browse(filter?: GalleryFilter): Promise<GalleryBrowseResult>;
  imageUrl(path: string): string;
}

export function galleryImageKey({ source, id }: GalleryImageReference): string {
  return `${source}:${id}`;
}

export function galleryImageReference({
  source,
  id,
  imagePath,
}: GalleryImageReference): GalleryImageReference {
  return { source, id, imagePath };
}

export function fromHubImage(image: ImageRecord): GalleryImage {
  return {
    source: "hub",
    id: image.id,
    imagePath: image.imagePath,
    description: image.prompt,
    savedAt: image.savedAt,
    generation: { prompt: image.prompt, startedAt: image.startedAt },
  };
}

export function isGalleryImageReference(value: unknown): value is GalleryImageReference {
  const ref = value as Partial<GalleryImageReference> | null | undefined;
  return (
    !!ref &&
    (ref.source === "phone" || ref.source === "hub") &&
    typeof ref.id === "string" &&
    !!ref.id.trim() &&
    typeof ref.imagePath === "string" &&
    !!ref.imagePath.trim()
  );
}
