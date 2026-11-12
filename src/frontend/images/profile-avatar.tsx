import { useState, type CSSProperties, type ReactNode } from "react";

import { useGallery } from "./gallery-context.ts";

export function ProfileAvatar({
  className,
  path,
  style,
  children,
}: {
  className: string;
  path?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { imageUrl } = useGallery();
  const [failedPath, setFailedPath] = useState<string>();
  return (
    <span className={className} style={style} aria-hidden="true">
      {path && failedPath !== path ? (
        <img
          key={path}
          src={imageUrl(path)}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
          onError={() => setFailedPath(path)}
        />
      ) : (
        children
      )}
    </span>
  );
}
