import { useEffect, useRef, useState } from "react";
import type { SpeechConnection, SpeechTransport } from "../../../core/speech/public.ts";

type SpeechPreview =
  | { status: "idle" | "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; voice: string; speed: number; format: "mp3" | "wav" };

export function useSpeechPreview(transport: SpeechTransport) {
  const [preview, setPreview] = useState<SpeechPreview>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const audioUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      if (audioUrl.current) {
        URL.revokeObjectURL(audioUrl.current);
      }
    },
    [],
  );

  async function generate(connection: SpeechConnection, input: string) {
    if (request.current) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPreview({ status: "pending" });
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    }
    try {
      const blob = await transport.generate(connection, input, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      const url = URL.createObjectURL(blob);
      audioUrl.current = url;
      setPreview({
        status: "ready",
        url,
        voice: connection.voice,
        speed: connection.speed,
        format: blob.type === "audio/wav" ? "wav" : "mp3",
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setPreview({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (request.current === controller) {
        request.current = null;
      }
    }
  }

  function cancel() {
    request.current?.abort();
    request.current = null;
    setPreview({ status: "idle" });
  }

  return { preview, generate, cancel };
}
