export interface VoiceOptions {
  voice: string;
  speed: number;
  playbackRate: number;
  volume: number;
  preservePitch: boolean;
  instructions?: string;
}

export interface SpeechConnection extends VoiceOptions {
  endpoint: string;
  model: string;
  voices: string;
  apiKey?: string;
}

export const defaultSpeechConnection: SpeechConnection = {
  endpoint: "",
  model: "gpt-realtime-2.1-mini",
  voices: "marin,cedar,alloy,ash,ballad,coral,echo,sage,shimmer,verse",
  voice: "marin",
  speed: 1,
  playbackRate: 1,
  volume: 1,
  preservePitch: true,
};

export interface SpeechTransport {
  generate(connection: SpeechConnection, input: string, signal: AbortSignal): Promise<Blob>;
}

export function voiceNames(voices: string): string[] {
  return [
    ...new Set(
      voices
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
}

export function validateSpeechConnection(value: unknown): asserts value is SpeechConnection {
  const connection = value as Partial<SpeechConnection> | null;
  if (
    !connection ||
    typeof connection.endpoint !== "string" ||
    typeof connection.model !== "string" ||
    !connection.model.trim() ||
    typeof connection.voices !== "string" ||
    typeof connection.voice !== "string" ||
    !voiceNames(connection.voices).includes(connection.voice) ||
    typeof connection.preservePitch !== "boolean" ||
    (connection.apiKey !== undefined &&
      (typeof connection.apiKey !== "string" || /[^\x21-\x7e]/.test(connection.apiKey))) ||
    (connection.instructions !== undefined &&
      (typeof connection.instructions !== "string" || connection.instructions.length > 1000)) ||
    !inRange(connection.speed, 0.25, 4) ||
    !inRange(connection.playbackRate, 0.5, 2) ||
    !inRange(connection.volume, 0, 1)
  ) {
    throw new Error("请检查模型名、默认音色、语速与播放设置");
  }
  let url: URL;
  try {
    url = new URL(connection.endpoint);
  } catch {
    throw new Error("请输入完整的 Speech 接口地址");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Speech 地址须使用 HTTP 或 HTTPS，且不含用户名、密码或片段");
  }
}

function inRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && value >= min && value <= max;
}
