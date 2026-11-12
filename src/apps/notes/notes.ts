import { isGalleryImageReference, type GalleryImageReference } from "../gallery/public.ts";

export interface NotesRole {
  readonly sourceId: string;
  readonly scopeId: string;
  readonly id: string;
  readonly name: string;
}

export type NotesBlock =
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "image"; readonly image: GalleryImageReference };

export interface NoteEntry {
  readonly id: string;
  readonly role: NotesRole;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly blocks: readonly NotesBlock[];
}

export interface NotesData {
  readonly version: 1;
  readonly lastRole: NotesRole | null;
  readonly entries: readonly NoteEntry[];
}

export interface NotesStorage {
  read(): Promise<unknown | null>;
  write(data: NotesData): Promise<void>;
}

export function createNoteId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function noteRoleKey({ sourceId, scopeId, id }: NotesRole): string {
  return JSON.stringify([sourceId, scopeId, id]);
}

function noteLines(blocks: readonly NotesBlock[]): string[] {
  return blocks.flatMap((block) =>
    block.type === "paragraph"
      ? block.text
          .split(/\r\n|\r|\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [],
  );
}

export function noteTitle(blocks: readonly NotesBlock[]): string {
  return noteLines(blocks)[0] ?? (noteHasContent(blocks) ? "图片备忘录" : "");
}

export function noteSummary(blocks: readonly NotesBlock[]): string {
  return noteLines(blocks).slice(1).join(" ");
}

export function noteHasContent(blocks: readonly NotesBlock[]): boolean {
  return blocks.some((block) => block.type === "image" || block.text.trim().length > 0);
}

export function textToNoteBlocks(text: string): NotesBlock[] {
  return text.split(/\r\n|\r|\n/).map((line) => ({ type: "paragraph", text: line }));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRole(value: unknown): value is NotesRole {
  const role = value as Partial<NotesRole> | null;
  return (
    !!role &&
    isNonemptyString(role.sourceId) &&
    isNonemptyString(role.scopeId) &&
    isNonemptyString(role.id) &&
    isNonemptyString(role.name)
  );
}

function isBlock(value: unknown): value is NotesBlock {
  const block = value as Partial<NotesBlock> | null;
  return (
    !!block &&
    ((block.type === "paragraph" && typeof block.text === "string") ||
      (block.type === "image" && isGalleryImageReference(block.image)))
  );
}

function isEntry(value: unknown): value is NoteEntry {
  const entry = value as Partial<NoteEntry> | null;
  return (
    !!entry &&
    isNonemptyString(entry.id) &&
    isRole(entry.role) &&
    isNonemptyString(entry.createdAt) &&
    Number.isFinite(Date.parse(entry.createdAt)) &&
    isNonemptyString(entry.updatedAt) &&
    Number.isFinite(Date.parse(entry.updatedAt)) &&
    Array.isArray(entry.blocks) &&
    entry.blocks.every(isBlock) &&
    noteHasContent(entry.blocks)
  );
}

export function readNotesData(value: unknown): NotesData {
  const data = value as Partial<NotesData> | null;
  if (
    !data ||
    data.version !== 1 ||
    (data.lastRole !== null && !isRole(data.lastRole)) ||
    !Array.isArray(data.entries) ||
    !data.entries.every(isEntry) ||
    new Set(data.entries.map((entry) => entry.id)).size !== data.entries.length
  ) {
    throw new Error("备忘录数据格式无效或版本不受支持");
  }
  return data as NotesData;
}
