import { pcm_length, type Pcm } from "./wav";

export interface Region {
  start: number;
  end: number;
}

export const CROSSFADE_SECONDS = 0.01;

export function normalize_regions(regions: readonly Region[], length: number): Region[] {
  const clamp = (value: number) => Math.max(0, Math.min(length, Math.round(value)));
  const clamped = regions
    .map(({ start, end }) => ({ start: clamp(Math.min(start, end)), end: clamp(Math.max(start, end)) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);
  const merged: Region[] = [];
  for (const region of clamped) {
    const last = merged.at(-1);
    if (last && region.start <= last.end) last.end = Math.max(last.end, region.end);
    else merged.push(region);
  }
  return merged;
}

export function subtract_regions(keep: Region, remove: readonly Region[], length: number): Region[] {
  const [range] = normalize_regions([keep], length);
  if (!range) return [];
  const kept: Region[] = [];
  let cursor = range.start;
  for (const cut of normalize_regions(remove, length)) {
    if (cut.end <= cursor || cut.start >= range.end) continue;
    if (cut.start > cursor) kept.push({ start: cursor, end: cut.start });
    cursor = cut.end;
  }
  if (range.end > cursor) kept.push({ start: cursor, end: range.end });
  return kept;
}

function seam(lengths: readonly number[], index: number, fade: number): number {
  return index > 0 ? Math.min(fade, lengths[index - 1], lengths[index]) : 0;
}

// Each seam overlaps the parts by `fade` frames, so the result is shorter than the sum of the regions.
export function cut_regions(
  pcm: Pcm,
  regions: readonly Region[],
  fade = Math.round(CROSSFADE_SECONDS * pcm.sample_rate)
): Pcm {
  const parts = normalize_regions(regions, pcm_length(pcm));
  const lengths = parts.map(({ start, end }) => end - start);
  const total = lengths.reduce((sum, length, index) => sum + length - seam(lengths, index, fade), 0);
  const channels = pcm.channels.map((source) => {
    const out = new Float32Array(total);
    let position = 0;
    parts.forEach(({ start, end }, index) => {
      const overlap = seam(lengths, index, fade);
      position -= overlap;
      for (let i = 0; i < overlap; i++) {
        const t = (i + 1) / (overlap + 1);
        out[position + i] = out[position + i] * (1 - t) + source[start + i] * t;
      }
      out.set(source.subarray(start + overlap, end), position + overlap);
      position += end - start;
    });
    return out;
  });
  return { sample_rate: pcm.sample_rate, channels };
}

export function peaks(pcm: Pcm, buckets: number): Float32Array {
  const count = Math.max(0, Math.floor(buckets));
  const out = new Float32Array(count * 2);
  const length = pcm_length(pcm);
  if (length === 0) return out;
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * length) / count);
    const end = Math.min(length, Math.max(start + 1, Math.floor(((bucket + 1) * length) / count)));
    let min = 0;
    let max = 0;
    for (const channel of pcm.channels) {
      for (let i = start; i < end; i++) {
        const value = channel[i];
        if (value < min) min = value;
        else if (value > max) max = value;
      }
    }
    out[bucket * 2] = min;
    out[bucket * 2 + 1] = max;
  }
  return out;
}

export interface PeakIndex {
  block: number;
  min: Float32Array;
  max: Float32Array;
  /** Largest absolute sample, for scaling the drawing to the loudest peak. */
  loudest: number;
}

/** Min and max per `block` frames across channels, built once so a zoomed view never rescans the whole sound. */
export function peak_index(pcm: Pcm, block = 256): PeakIndex {
  const length = pcm_length(pcm);
  const count = Math.ceil(length / block);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  let loudest = 0;
  for (let index = 0; index < count; index++) {
    const start = index * block;
    const end = Math.min(length, start + block);
    let low = 0;
    let high = 0;
    for (const channel of pcm.channels) {
      for (let i = start; i < end; i++) {
        const value = channel[i];
        if (value < low) low = value;
        else if (value > high) high = value;
      }
    }
    min[index] = low;
    max[index] = high;
    loudest = Math.max(loudest, high, -low);
  }
  return { block, min, max, loudest };
}

/** Like `peaks`, for frames `from` to `to`: buckets as wide as a block or more read the index, narrower ones the samples. */
export function peaks_between(pcm: Pcm, index: PeakIndex, from: number, to: number, buckets: number): Float32Array {
  const count = Math.max(0, Math.floor(buckets));
  const out = new Float32Array(count * 2);
  const length = pcm_length(pcm);
  const first = Math.max(0, Math.min(length, from));
  const last = Math.max(first, Math.min(length, to));
  if (length === 0 || last === first) return out;
  const span = last - first;
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor(first + (bucket * span) / count);
    const end = Math.min(length, Math.max(start + 1, Math.floor(first + ((bucket + 1) * span) / count)));
    let low = 0;
    let high = 0;
    if (end - start >= index.block) {
      const block_end = Math.min(index.min.length, Math.ceil(end / index.block));
      for (let i = Math.floor(start / index.block); i < block_end; i++) {
        if (index.min[i] < low) low = index.min[i];
        if (index.max[i] > high) high = index.max[i];
      }
    } else {
      for (const channel of pcm.channels) {
        for (let i = start; i < end; i++) {
          const value = channel[i];
          if (value < low) low = value;
          else if (value > high) high = value;
        }
      }
    }
    out[bucket * 2] = low;
    out[bucket * 2 + 1] = high;
  }
  return out;
}
