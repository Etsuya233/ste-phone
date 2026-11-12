import { useEffect, useRef, useState } from "react";
import type { NotesService } from "../notes-service.ts";

type WritingState =
  { stage: "prompt"; error?: string } | { stage: "generating" | "preview"; text: string };

export function useNotesWriting(notes: NotesService) {
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<WritingState>({ stage: "prompt" });
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function generate() {
    if (request.current || !instruction.trim()) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ stage: "generating", text: "" });
    try {
      const text = await notes.generate(instruction, controller.signal, (text) => {
        if (!controller.signal.aborted) {
          setState({ stage: "generating", text });
        }
      });
      if (!controller.signal.aborted) {
        setState({ stage: "preview", text });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ stage: "prompt", error: (error as Error).message });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
      }
    }
  }

  function discard() {
    request.current?.abort();
    request.current = null;
    setState({ stage: "prompt" });
  }

  return { instruction, setInstruction, state, generate, discard };
}
