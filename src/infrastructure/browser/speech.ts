import type { SpeechTransport } from "../../core/speech/public.ts";

export function createBrowserSpeech(request = fetch): SpeechTransport {
  return {
    async generate(connection, input, signal) {
      const endpoint = new URL(connection.endpoint);
      if (endpoint.protocol === "http:" && location.protocol === "https:") {
        throw new Error("当前页面使用 HTTPS，请填写 HTTPS 语音接口地址");
      }
      const headers = new Headers({ "Content-Type": "application/json" });
      if (connection.apiKey) {
        headers.set("Authorization", `Bearer ${connection.apiKey}`);
      }
      const response = await request(endpoint.href, {
        method: "POST",
        headers,
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(150000)]),
        body: JSON.stringify({
          model: connection.model,
          voice: connection.voice,
          speed: connection.speed,
          input,
          response_format: "mp3",
          instructions: connection.instructions?.trim() || undefined,
        }),
      }).catch((error: unknown) => {
        if (error instanceof TypeError) {
          throw new Error("无法直连语音接口，请检查地址、HTTPS 证书与 CORS 配置", { cause: error });
        }
        throw error;
      });
      if (!response.ok) {
        const body = (await response.text()).trim();
        const detail = body.startsWith("{") ? body.slice(0, 300) : "";
        throw new Error(`语音请求失败（HTTP ${response.status}）${detail ? ` ${detail}` : ""}`);
      }
      const audio = await response.blob();
      if (!audio.size || !audio.type.startsWith("audio/")) {
        throw new Error("语音接口未返回可播放的音频");
      }
      return audio;
    },
  };
}
