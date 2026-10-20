import { describe, expect, test } from "vitest";
import { encode_wav, pcm_of, WAV_HEADER_BYTES, type Pcm } from "./wav";

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

describe("encode_wav", () => {
  const stereo: Pcm = {
    sample_rate: 44100,
    channels: [new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 2])],
  };

  test("writes a 44-byte PCM16 header", () => {
    const view = new DataView(encode_wav(stereo));
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 3 * 2 * 2);
    expect(ascii(view, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(12);
  });

  test("is the header plus two bytes per sample per channel", () => {
    expect(encode_wav(stereo).byteLength).toBe(WAV_HEADER_BYTES + 12);
    expect(encode_wav({ sample_rate: 8000, channels: [new Float32Array(100)] }).byteLength).toBe(
      WAV_HEADER_BYTES + 200
    );
  });

  test("interleaves channels, scales to 16 bits and clips", () => {
    const view = new DataView(encode_wav(stereo));
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(WAV_HEADER_BYTES + i * 2, true));
    expect(samples).toEqual([0, 16383, 32767, -16384, -32768, 32767]);
  });

  test("an empty sound is a valid header with no data", () => {
    const view = new DataView(encode_wav({ sample_rate: 8000, channels: [] }));
    expect(view.byteLength).toBe(WAV_HEADER_BYTES);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(0);
  });
});

test("pcm_of reads every channel of an AudioBuffer", () => {
  const data = [new Float32Array([1]), new Float32Array([2])];
  const pcm = pcm_of({ sampleRate: 22050, numberOfChannels: 2, getChannelData: (channel) => data[channel] });
  expect(pcm.sample_rate).toBe(22050);
  expect(pcm.channels).toEqual(data);
});
