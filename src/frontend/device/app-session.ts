export const appNames = {
  stopwatch: "秒表",
  foundation: "组件",
  "data-source": "资料",
  database: "Fake DBeaver",
  diary: "日记",
  settings: "设置",
} as const;
export type AppId = keyof typeof appNames;
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
