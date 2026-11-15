import { appCatalog } from "../../core/launcher/catalog.ts";
import type { AppId } from "../../core/launcher/catalog.ts";
export type { AppId } from "../../core/launcher/catalog.ts";
export const appNames = Object.fromEntries(
  Object.entries(appCatalog).map(([id, app]) => [id, app.name]),
) as Record<AppId, string>;
export interface AppSession {
  foreground: AppId | "home" | "expose";
  recent: AppId[];
}
export type SessionAction =
  | { type: "open"; app: AppId }
  | { type: "home" | "expose" }
  | { type: "quit"; app: AppId }
  | { type: "evict"; apps: readonly AppId[] };

export function appsBeyondLimit({ recent }: AppSession, limit: number | null): AppId[] {
  // The most recently opened app, including the foreground app, takes the first slot.
  return limit === null ? [] : recent.slice(limit);
}
export function appSession(state: AppSession, action: SessionAction): AppSession {
  if (action.type === "open") {
    return {
      foreground: action.app,
      recent: [action.app, ...state.recent.filter((app) => app !== action.app)],
    };
  }
  if (action.type === "quit") {
    return {
      foreground: state.foreground === action.app ? "expose" : state.foreground,
      recent: state.recent.filter((app) => app !== action.app),
    };
  }
  if (action.type === "evict") {
    return { ...state, recent: state.recent.filter((app) => !action.apps.includes(app)) };
  }
  return { ...state, foreground: action.type };
}
