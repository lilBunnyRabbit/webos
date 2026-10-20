export interface Pcm {
  sample_rate: number;
  channels: Float32Array[];
}

interface AudioBufferLike {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export const WAV_HEADER_BYTES = 44;

export function pcm_of(buffer: AudioBufferLike): Pcm {
  return {
    sample_rate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)),
  };
}

export function pcm_length(pcm: Pcm): number {
  return pcm.channels[0]?.length ?? 0;
}

export function encode_wav(pcm: Pcm): ArrayBuffer {
  const channels = Math.max(1, pcm.channels.length);
  const frames = pcm_length(pcm);
  const data_bytes = frames * channels * 2;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + data_bytes));
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + data_bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, pcm.sample_rate, true);
  view.setUint32(28, pcm.sample_rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data_bytes, true);
  let offset = WAV_HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, pcm.channels[channel]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return view.buffer;
}

export function wav_blob(pcm: Pcm): Blob {
  return new Blob([encode_wav(pcm)], { type: "audio/wav" });
}
