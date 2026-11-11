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
  | { page: "switch-account" }
  | { page: "manage" }
  | { page: "create-accounts" }
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
  active: boolean;
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
      <CampusFeedback service={service} state={state} />
      {children}
    </Page>
  );
}

function CampusFeedback({ service, state }: Pick<CampusPageProps, "service" | "state">) {
  const status =
    state.phase === "generating" ? "正在生成…" : state.phase === "saving" ? "正在保存…" : null;
  const saved = state.phase === "idle" ? state.lastSaved : null;
  if (!status && !state.error && state.phase !== "unsaved" && !saved) {
    return null;
  }
  return (
    <div className="campus-feedback">
      {status ? <p role="status">{status}</p> : null}
      {state.phase === "generating" ? (
        <Button onClick={() => service.stop()}>停止生成</Button>
      ) : null}
      {state.phase === "unsaved" ? (
        <>
          <p role="alert">{state.error}</p>
          <div className="campus-row">
            <Button disabled={!state.canRetry} onClick={() => void service.retry()}>
              重试保存
            </Button>
            <Button variant="danger" onClick={() => service.discard()}>
              舍弃结果
            </Button>
          </div>
        </>
      ) : state.error ? (
        <div className="campus-feedback-row">
          <p role="alert">{state.error}</p>
          <Button onClick={() => service.dismissError()}>关闭</Button>
        </div>
      ) : saved ? (
        <div className="campus-feedback-row">
          <p role="status">{savedMessage(saved)}</p>
          <Button onClick={() => service.clearSaved()}>关闭</Button>
        </div>
      ) : null}
    </div>
  );
}

function savedMessage(saved: NonNullable<CampusPageProps["state"]["lastSaved"]>): string {
  if (saved.kind === "published") {
    return "帖子已发布";
  }
  if (saved.kind === "commented") {
    return "评论已发送";
  }
  const parts: string[] = [];
  if (saved.postIds.length) {
    parts.push(`已生成 ${saved.postIds.length} 条帖子`);
  }
  if (saved.commentIds.length) {
    parts.push(`新增 ${saved.commentIds.length} 条评论`);
  }
  return parts.join("，");
}
