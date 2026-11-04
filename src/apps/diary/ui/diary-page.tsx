import type { ReactNode } from "react";
import type { DiaryService } from "../diary-service.ts";
import type { DiarySnapshot } from "../diary.ts";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";

export type DiaryRoute =
  | { page: "home" }
  | { page: "book"; bookKey: string }
  | { page: "authors" }
  | { page: "settings" }
  | { page: "write" }
  | { page: "image-prompt"; id: string }
  | { page: "image-picker"; id: string }
  | { page: "image-view"; id: string }
  | { page: "detail"; id: string; fromBookKey: string };

export interface DiaryPageProps {
  diary: DiaryService;
  state: DiarySnapshot;
  navigation: Navigation<DiaryRoute>;
  onHome: () => void;
}

export function DiaryNotices({
  state,
  error = null,
}: {
  state: DiarySnapshot;
  error?: string | null;
}) {
  const generation = state.generation;
  const generationError =
    generation.status === "error" || generation.status === "save-error"
      ? generation.error.message
      : null;
  return (
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
      {!state.chatId ? <p>打开一个聊天，就能把日子收进这本日记。</p> : null}
    </div>
  );
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
  return (
    <Page
      inert={inert}
      className="diary-page"
      navBar={<NavBar title={title} back={{ label: backLabel, onClick: onBack }} right={right} />}
    >
      <DiaryNotices state={state} error={error} />
      {children}
    </Page>
  );
}
