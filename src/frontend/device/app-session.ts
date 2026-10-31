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
  { type: "open"; app: AppId } | { type: "home" | "expose" } | { type: "quit"; app: AppId };
export function appSession(state: AppSession, action: SessionAction): AppSession {
  if (action.type === "open")
    return {
      foreground: action.app,
      recent: [action.app, ...state.recent.filter((app) => app !== action.app)],
    };
  if (action.type === "quit")
    return {
      foreground: state.foreground === action.app ? "expose" : state.foreground,
      recent: state.recent.filter((app) => app !== action.app),
    };
  return { ...state, foreground: action.type };
}
