import { useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { ImageGrid } from "../../../frontend/images/image-views.tsx";
import type { CampusImage } from "../campus-domain.ts";

export function CampusImageEditor({
  image,
  hub,
  disabled,
  onChange,
  onRemove,
  onWorking,
  stillOwned,
}: {
  image: CampusImage;
  hub: ImageHub;
  disabled: boolean;
  onChange: (image: CampusImage) => void;
  onRemove?: () => void;
  onWorking: (working: boolean) => void;
  stillOwned: () => boolean;
}) {
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [gallery, setGallery] = useState<readonly ImageRecord[] | null>(null);
  const prompt = image.prompt?.trim() || image.description.trim();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function select(record: ImageRecord) {
    onChange({
      ...image,
      description: image.description.trim() || record.prompt,
      image: { id: record.id, path: record.imagePath },
    });
    setGallery(null);
  }

  async function request(kind: "gallery" | "generate") {
    setWorking(true);
    onWorking(true);
    setError(null);
    try {
      const records = await (kind === "gallery" ? hub.listImages() : hub.generate({ prompt }));
      // Image Hub may finish after leaving the draft. Its saved assets stay in the gallery.
      if (!mounted.current || !stillOwned()) {
        return;
      }
      if (kind === "gallery") {
        setGallery(records);
      } else {
        const record = records[0];
        if (!record) {
          throw new Error("生图完成，但图库未返回图片。");
        }
        select(record);
      }
    } catch (cause) {
      if (mounted.current && stillOwned()) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (mounted.current) {
        setWorking(false);
        onWorking(false);
      }
    }
  }

  return (
    <div className="campus-image-fields">
      {image.image ? (
        <img className="campus-image-preview" src={image.image.path} alt={image.description} />
      ) : null}
      <label>
        图片描述
        <textarea
          value={image.description}
          disabled={disabled || working}
          rows={2}
          onChange={(event) => onChange({ ...image, description: event.target.value })}
        />
      </label>
      <label>
        绘图提示词
        <textarea
          value={image.prompt ?? ""}
          disabled={disabled || working}
          rows={2}
          placeholder="留空时使用图片描述"
          onChange={(event) => onChange({ ...image, prompt: event.target.value })}
        />
      </label>
      <div className="campus-row campus-actions">
        <Button disabled={disabled || working} onClick={() => void request("gallery")}>
          图库选图
        </Button>
        <Button disabled={disabled || working || !prompt} onClick={() => void request("generate")}>
          生成图片
        </Button>
        {onRemove ? (
          <Button disabled={disabled || working} variant="danger" onClick={onRemove}>
            移除配图
          </Button>
        ) : null}
      </div>
      {working ? (
        <p role="status" className="campus-meta">
          正在处理图片…
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {gallery ? (
        <CampusImageLibrary
          images={gallery}
          disabled={disabled || working}
          onSelect={select}
          onClose={() => setGallery(null)}
        />
      ) : null}
    </div>
  );
}

function CampusImageLibrary({
  images,
  disabled,
  onSelect,
  onClose,
}: {
  images: readonly ImageRecord[];
  disabled: boolean;
  onSelect: (image: ImageRecord) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<ImageRecord | null>(null);
  return preview ? (
    <div>
      <img className="campus-image-preview" src={preview.imagePath} alt={preview.prompt} />
      <Button variant="filled" disabled={disabled} onClick={() => onSelect(preview)}>
        使用这张
      </Button>
      <Button onClick={() => setPreview(null)}>返回列表</Button>
    </div>
  ) : (
    <div>
      <ImageGrid images={images} empty="图库还没有图片。" onOpen={setPreview} />
      <Button onClick={onClose}>关闭图库</Button>
    </div>
  );
}
