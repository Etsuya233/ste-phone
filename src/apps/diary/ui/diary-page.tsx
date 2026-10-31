import type { ReactNode } from "react";
import type { DiaryService } from "../diary-service.ts";
import type { DiarySnapshot } from "../diary.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";

export type DiaryRoute =
  { page: "list" | "authors" | "settings" | "write" } | { page: "detail"; id: string };

export interface DiaryPageProps {
  diary: DiaryService;
  state: DiarySnapshot;
  navigation: Navigation<DiaryRoute>;
  onHome: () => void;
}

export function DiaryPage({
  state,
  title,
  onBack,
  backLabel = "日记",
  right,
  inert,
  error,
  children,
}: {
  state: DiarySnapshot;
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
  inert?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const generation = state.generation;
  const generationError =
    generation.status === "error" || generation.status === "save-error"
      ? generation.error.message
      : null;
  return (
    <Page
      inert={inert}
      className="diary-page"
      navBar={<NavBar title={title} back={{ label: backLabel, onClick: onBack }} right={right} />}
    >
      <div className="diary-notices" aria-live="polite">
        {generationError ? (
          <p className="diary-error" role="alert">
            {generationError}
          </p>
        ) : null}
        {state.preparationError ? (
          <p className="diary-error" role="alert">
            {state.preparationError.message}
          </p>
        ) : null}
        {error ? (
          <p className="diary-error" role="alert">
            {error}
          </p>
        ) : null}
        {!state.chatId ? <p>选择一个聊天后，即可记录这里的日记。</p> : null}
      </div>
      {children}
    </Page>
  );
}
