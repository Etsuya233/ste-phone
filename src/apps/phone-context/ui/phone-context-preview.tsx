import { useState } from "react";
import type { PhoneContextPreset, PhoneContextService } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";

function readPreview(
  service: PhoneContextService,
  preset: PhoneContextPreset,
): { text: string; error: null } | { text: null; error: string } {
  try {
    return { text: service.preview(preset), error: null };
  } catch (error) {
    return { text: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function PhoneContextPreview({
  service,
  preset,
  onBack,
}: {
  service: PhoneContextService;
  preset: PhoneContextPreset;
  onBack(): void;
}) {
  const [preview, setPreview] = useState(() => readPreview(service, preset));
  return (
    <Page
      className="phone-context-page"
      navBar={
        <NavBar
          title="宏展开预览"
          back={{ label: "宏绑定", onClick: onBack }}
          right={<Button onClick={() => setPreview(readPreview(service, preset))}>刷新</Button>}
        />
      }
    >
      <p className="phone-context-note">
        读取所引用 App Intent 的已保存内容。此处未保存的绑定修改仅用于预览。
      </p>
      {preview.error !== null ? (
        <p className="phone-context-error" role="alert">
          {preview.error}
        </p>
      ) : preview.text ? (
        <pre className="phone-context-output">{preview.text}</pre>
      ) : (
        <p className="phone-context-note">当前 App Intent 没有内容，宏将展开为空文本。</p>
      )}
    </Page>
  );
}
