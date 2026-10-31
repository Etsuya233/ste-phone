import type { ReactNode } from "react";

export interface AppVisibility {
  readonly foreground: boolean;
  readonly windowVisible: boolean;
}

/** Each app owns its response to these facts; hiding a window never implies quitting. */
export interface AppDefinition {
  render(props: { active: boolean; onHome: () => void; visibility: AppVisibility }): ReactNode;
  onVisibilityChange?(visibility: AppVisibility): void;
  onQuit?(): void;
}
