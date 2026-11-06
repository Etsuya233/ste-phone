import { useEffect, useRef } from "react";
import type { VoiceOptions } from "../../../core/speech/public.ts";

export function VoicePlayer({
  url,
  active,
  options,
}: {
  url: string;
  active: boolean;
  options: VoiceOptions;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const { playbackRate, preservePitch, volume } = options;
  useEffect(() => {
    const element = audio.current!;
    element.defaultPlaybackRate = playbackRate;
    element.playbackRate = playbackRate;
    element.preservesPitch = preservePitch;
    element.volume = volume;
    if (!active) {
      element.pause();
    }
  }, [active, playbackRate, preservePitch, volume]);
  return <audio ref={audio} controls src={url} aria-label="试听生成的语音" />;
}
