import type { ReactNode } from "react";

/** Muted line icons share one stroke weight; the filled variant is reserved for AI marks. */
function NotesIcon({
  className = "",
  filled = false,
  children,
}: {
  className?: string;
  filled?: boolean;
  children: ReactNode;
}) {
  return (
    <svg
      className={`notes-icon ${filled ? "notes-icon--filled" : ""} ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export function NotesSearchIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className}>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.6 15.6 4.1 4.1" />
    </NotesIcon>
  );
}

export function NotesChevronIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className}>
      <path d="m9.5 5.2 6.8 6.8-6.8 6.8" />
    </NotesIcon>
  );
}

export function NotesPlusIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className}>
      <path d="M12 5.2v13.6M5.2 12h13.6" />
    </NotesIcon>
  );
}

export function NotesPenIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className}>
      <path d="M4.5 19.5h4l10.2-10.2a2.6 2.6 0 0 0-3.7-3.7L4.8 15.8l-.3 3.7Z" />
      <path d="m13.7 6.9 3.7 3.7" />
    </NotesIcon>
  );
}

export function NotesImageIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className}>
      <rect x="3.4" y="4.8" width="17.2" height="14.4" rx="2.8" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 17 4.6-4.6 3.4 3.4 2.3-2.3 3.7 3.5" />
    </NotesIcon>
  );
}

export function NotesTrashIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className}>
      <path d="M5 7h14M9.2 7V4.7h5.6V7m-8 0 .8 12.3h8.8L17.2 7" />
      <path d="M10.3 10.6v5.2M13.7 10.6v5.2" />
    </NotesIcon>
  );
}

export function NotesSparkleIcon({ className }: IconProps) {
  return (
    <NotesIcon className={className} filled>
      <path d="M10.4 3.2c.5 3.8 1.5 4.8 5.3 5.3-3.8.5-4.8 1.5-5.3 5.3-.5-3.8-1.5-4.8-5.3-5.3 3.8-.5 4.8-1.5 5.3-5.3Z" />
      <path d="M17.8 13.2c.3 2.2.9 2.8 3.1 3.1-2.2.3-2.8.9-3.1 3.1-.3-2.2-.9-2.8-3.1-3.1 2.2-.3 2.8-.9 3.1-3.1Z" />
    </NotesIcon>
  );
}
