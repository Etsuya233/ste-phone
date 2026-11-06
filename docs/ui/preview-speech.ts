import type { SpeechTransport } from "../../src/core/speech/public.ts";

export const previewSpeech: SpeechTransport = {
  async generate(_connection, _text, signal) {
    signal.throwIfAborted();
    // One short tone exercises the actual player without contacting a provider.
    const rate = 8000;
    const samples = 2400;
    const wav = new DataView(new ArrayBuffer(44 + samples * 2));
    wav.setUint32(0, 0x52494646);
    wav.setUint32(4, wav.byteLength - 8, true);
    wav.setUint32(8, 0x57415645);
    wav.setUint32(12, 0x666d7420);
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, 1, true);
    wav.setUint32(24, rate, true);
    wav.setUint32(28, rate * 2, true);
    wav.setUint16(32, 2, true);
    wav.setUint16(34, 16, true);
    wav.setUint32(36, 0x64617461);
    wav.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) {
      wav.setInt16(
        44 + i * 2,
        3500 * Math.sin((2 * Math.PI * 440 * i) / rate) * Math.sin((Math.PI * i) / samples),
        true,
      );
    }
    return new Blob([wav], { type: "audio/wav" });
  },
};
