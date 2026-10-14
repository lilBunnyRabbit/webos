import { clamp } from "$lib/core/utils";
export const VisualizerMode = {
  BARS: "bars",
  WAVE: "wave",
  RADIAL: "radial",
} as const;

export type VisualizerMode = (typeof VisualizerMode)[keyof typeof VisualizerMode];

export interface Band {
  start: number;
  end: number;
}

export interface BandOptions {
  bin_count: number;
  band_count: number;
  sample_rate: number;
  min_hz?: number;
  max_hz?: number;
}

// Low octaves span fewer bins than bands, so each band is pushed at least one bin past the previous one.
export function log_bands({ bin_count, band_count, sample_rate, min_hz = 30, max_hz = 16000 }: BandOptions): Band[] {
  if (bin_count <= 0 || band_count <= 0) return [];
  const nyquist = sample_rate / 2;
  const hz_per_bin = nyquist / bin_count;
  const low = clamp(min_hz, hz_per_bin, nyquist);
  const high = clamp(max_hz, low, nyquist);
  const first = Math.min(Math.floor(low / hz_per_bin), bin_count - 1);
  const count = Math.min(band_count, bin_count - first);
  const ratio = high / low;

  const bands: Band[] = [];
  let start = first;
  for (let i = 0; i < count; i++) {
    const remaining = count - i - 1;
    const edge = Math.round((low * ratio ** ((i + 1) / count)) / hz_per_bin);
    const end = clamp(edge, start + 1, bin_count - remaining);
    bands.push({ start, end });
    start = end;
  }
  return bands;
}

export function group_bins(data: ArrayLike<number>, bands: Band[], out: Float32Array): Float32Array {
  bands.forEach((band, i) => {
    let sum = 0;
    for (let bin = band.start; bin < band.end; bin++) sum += data[bin] ?? 0;
    out[i] = sum / (band.end - band.start) / 255;
  });
  return out;
}

// Soft knee, so quiet tracks still move without loud ones pinning every bar at the top.
export function apply_sensitivity(value: number, sensitivity: number): number {
  const boosted = Math.max(0, value) * sensitivity;
  return boosted <= 0.8 ? boosted : 0.8 + 0.2 * (1 - Math.exp(-(boosted - 0.8) * 5));
}

export function decay(previous: Float32Array, next: ArrayLike<number>, fall: number): Float32Array {
  for (let i = 0; i < previous.length; i++) {
    const target = next[i] ?? 0;
    previous[i] = target >= previous[i] ? target : Math.max(target, previous[i] - fall);
  }
  return previous;
}

export function wave_sample(byte: number): number {
  return (byte - 128) / 128;
}

// 1 would freeze the spectrum.
export function analyser_smoothing(amount: number): number {
  return clamp(amount, 0, 1) * 0.95;
}

export function format_time(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
