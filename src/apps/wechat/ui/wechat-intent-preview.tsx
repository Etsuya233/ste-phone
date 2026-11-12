import { useState } from "react";
import type { WechatIntentResult } from "../wechat-intent.ts";
import type { WechatIntent, WechatIntentService } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";

function readPreview(
  service: WechatIntentService,
  preset: WechatIntent,
): { result: WechatIntentResult; error: null } | { result: null; error: string } {
  try {
    return { result: service.preview(preset), error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function WechatIntentPreview({
  service,
  preset,
  onBack,
}: {
  service: WechatIntentService;
  preset: WechatIntent;
  onBack(): void;
}) {
  const [preview, setPreview] = useState(() => readPreview(service, preset));
  return (
    <Page
      className="wechat-intent-page"
      navBar={
        <NavBar
          title="展开预览"
          back={{ label: "Intent", onClick: onBack }}
          right={<Button onClick={() => setPreview(readPreview(service, preset))}>刷新</Button>}
        />
      }
    >
      <p className="wechat-intent-note">
        按当前编辑内容预览，未保存的修改不会影响已引用的 App
        Intent。刷新可重新读取消息并计算时间范围。
      </p>
      {preview.error !== null ? (
        <p className="wechat-intent-error" role="alert">
          {preview.error}
        </p>
      ) : (
        <>
          <p className="wechat-intent-note">
            包含 {preview.result.groupCount} 个会话、{preview.result.itemCount} 条消息。
          </p>
          <p className="wechat-intent-note">
            已排除：屏障前 {preview.result.excluded.barrier} 条，时间范围外{" "}
            {preview.result.excluded.time} 条，超出条数 {preview.result.excluded.limit} 条。
          </p>
          {preview.result.text ? (
            <pre className="wechat-intent-output">{preview.result.text}</pre>
          ) : (
            <p className="wechat-intent-note">当前范围没有消息，宏将展开为空文本。</p>
          )}
        </>
      )}
    </Page>
  );
}
