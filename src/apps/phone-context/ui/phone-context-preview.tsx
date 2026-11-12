import { useState } from "react";
import type { ContextResult } from "../../../core/phone-context/public.ts";
import type { PhoneContextPreset, PhoneContextService } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";

function readPreview(
  service: PhoneContextService,
  preset: PhoneContextPreset,
): { result: ContextResult; error: null } | { result: null; error: string } {
  try {
    return { result: service.preview(preset), error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : String(error) };
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
          title="展开预览"
          back={{ label: "预设", onClick: onBack }}
          right={<Button onClick={() => setPreview(readPreview(service, preset))}>刷新</Button>}
        />
      }
    >
      <p className="phone-context-note">
        按当前编辑内容预览，未保存的修改不会影响 ST 宏。刷新可重新读取消息并计算时间范围。
      </p>
      {preview.error !== null ? (
        <p className="phone-context-error" role="alert">
          {preview.error}
        </p>
      ) : (
        <>
          <p className="phone-context-note">
            包含 {preview.result.groupCount} 个会话、{preview.result.itemCount} 条消息。
          </p>
          <p className="phone-context-note">
            已排除：屏障前 {preview.result.excluded.barrier} 条，时间范围外{" "}
            {preview.result.excluded.time} 条，超出条数 {preview.result.excluded.limit} 条。
          </p>
          {preview.result.text ? (
            <pre className="phone-context-output">{preview.result.text}</pre>
          ) : (
            <p className="phone-context-note">当前范围没有消息，宏将展开为空文本。</p>
          )}
        </>
      )}
    </Page>
  );
}
