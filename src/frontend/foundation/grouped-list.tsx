import { useId } from "react";
import type { ReactNode } from "react";
export function GroupedList({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="ios-group" aria-labelledby={title ? id : undefined}>
      {title ? (
        <h2 id={id} className="ios-group-title">
          {title}
        </h2>
      ) : null}
      <div className="ios-group-rows">{children}</div>
      {description ? <p className="ios-group-description">{description}</p> : null}
    </section>
  );
}
