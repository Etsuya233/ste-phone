import type { ReactNode } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import type { CampusService } from "../campus-service.ts";

export type CampusRoute =
  | { page: "home" }
  | { page: "post"; postId: string }
  | { page: "profile"; accountId: string }
  | { page: "manage" }
  | { page: "edit-account"; accountId?: string }
  | { page: "compose" }
  | { page: "generate"; postId: string | null }
  | { page: "heat"; postId: string }
  | { page: "image"; postId: string; index: number };

export interface CampusPageProps {
  service: CampusService;
  state: ReturnType<CampusService["getSnapshot"]>;
  navigation: Navigation<CampusRoute>;
  onHome: () => void;
}

export function CampusPage({
  service,
  state,
  title,
  back,
  home = false,
  right,
  footer,
  footerHeight = 50,
  children,
}: Pick<CampusPageProps, "service" | "state"> & {
  title: string;
  back: () => void;
  home?: boolean;
  right?: ReactNode;
  footer?: ReactNode;
  footerHeight?: number;
  children: ReactNode;
}) {
  const status =
    state.phase === "generating" ? "正在生成…" : state.phase === "saving" ? "正在保存…" : null;
  return (
    <Page
      className="campus-page"
      navBar={
        <NavBar
          title={title}
          back={{ label: home ? "主屏" : "返回", onClick: back }}
          right={right}
        />
      }
      {...(footer ? { footer, footerHeight } : { footer: undefined, footerHeight: undefined })}
    >
      {status || state.error || state.phase === "unsaved" ? (
        <div className="campus-feedback">
          {status ? <p role="status">{status}</p> : null}
          {state.error ? <p role="alert">{state.error}</p> : null}
          {state.phase === "generating" ? (
            <Button onClick={() => service.stop()}>停止生成</Button>
          ) : null}
          {state.phase === "unsaved" ? (
            <>
              <p>本批结果尚未保存，可以重试保存或舍弃。</p>
              <Button disabled={!state.canRetry} onClick={() => void service.retry()}>
                重试保存
              </Button>
              <Button variant="danger" onClick={() => service.discard()}>
                舍弃结果
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {children}
    </Page>
  );
}
