import { useEffect, useState } from "react";
import type { DataAppPublic } from "../public.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";

export function StorySummaryPage({ source, onBack }: { source: DataAppPublic; onBack(): void }) {
  const [result, setResult] = useState<{ text: string } | { error: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const scope = { ...source.getSnapshot().context };
    void source.readSummary(scope).then(
      (text) => {
        if (alive) {
          setResult({ text });
        }
      },
      (error) => {
        if (alive) {
          setResult({ error: (error as Error).message });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [source]);
  return (
    <Page navBar={<NavBar title="剧情总结" back={{ label: "资料", onClick: onBack }} />}>
      {result === null ? (
        <p className="data-empty">正在读取剧情总结…</p>
      ) : "error" in result ? (
        <p className="data-error" role="alert">
          {result.error}
        </p>
      ) : (
        <p className="data-detail">{result.text || "还没有剧情总结或未总结纪要。"}</p>
      )}
    </Page>
  );
}
