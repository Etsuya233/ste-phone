import { useEffect, useState } from "react";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import type { NotesService } from "../notes-service.ts";
import { noteHasContent, type NotesBlock, type NotesRole } from "../notes.ts";
import type { NotesRoute } from "./notes-app.tsx";

export interface NotesDraftStart {
  readonly id: string;
  readonly role: NotesRole;
  readonly blocks: readonly NotesBlock[];
  readonly persisted: boolean;
}

/** Retain the full draft after a failed write. Only a confirmed write may return to the list. */
export function useNoteDraft(
  notes: NotesService,
  start: NotesDraftStart,
  navigation: Navigation<NotesRoute>,
) {
  const [blocks, setBlocks] = useState(start.blocks);
  const [phase, setPhase] = useState<"editing" | "saving" | "deleting" | "leaving">("editing");
  const [error, setError] = useState<string | null>(null);
  const hasContent = noteHasContent(blocks);
  const changed = start.persisted
    ? JSON.stringify(blocks) !== JSON.stringify(start.blocks)
    : hasContent;
  const busy = phase !== "editing";

  useEffect(() => {
    if (phase === "leaving" && navigation.current) {
      navigation.pop();
    }
  }, [phase, navigation]);

  async function saveAndReturn() {
    if (busy) {
      return;
    }
    if (!changed) {
      navigation.pop();
      return;
    }
    if (!hasContent) {
      setError("备忘录内容为空。请补充内容，或选择删除备忘录。");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      await notes.saveNote({ id: start.id, role: start.role, blocks });
      setPhase("leaving");
    } catch (error) {
      setError((error as Error).message);
      setPhase("editing");
    }
  }

  async function deleteAndReturn() {
    if (busy) {
      return;
    }
    setPhase("deleting");
    setError(null);
    try {
      await notes.deleteNote(start.id);
      setPhase("leaving");
    } catch (error) {
      setError((error as Error).message);
      setPhase("editing");
    }
  }

  return { setBlocks, changed, phase, busy, error, saveAndReturn, deleteAndReturn };
}
