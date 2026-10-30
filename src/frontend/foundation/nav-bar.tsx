import type { ReactNode } from "react";
import { Button } from "./button.tsx";
import { Icon } from "./icon.tsx";
export function NavBar({
  title,
  back,
  right,
}: {
  title: string;
  back?: { label: string; onClick: () => void };
  right?: ReactNode;
}) {
  return (
    <header className="ios-nav">
      <div className="ios-nav-side">
        {back ? (
          <Button onClick={back.onClick}>
            <Icon>
              <svg viewBox="0 0 12 22">
                <path d="m10 2-8 9 8 9" />
              </svg>
            </Icon>
            <span>{back.label}</span>
          </Button>
        ) : null}
      </div>
      <h1 title={title}>{title}</h1>
      <div className="ios-nav-side ios-nav-side--right">{right}</div>
    </header>
  );
}
