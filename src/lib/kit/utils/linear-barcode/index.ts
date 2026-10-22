import { decode_code128, decode_code39, decode_ean13, decode_ean8, decode_upce, LinearFormat, type LinearCode } from "./symbologies";

export { LinearFormat, type LinearCode } from "./symbologies";

export const LINEAR_FORMATS: readonly string[] = Object.values(LinearFormat);

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

export function to_gray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return { data, width, height };
}

const BUCKETS = 32;

/**
 * Dark/light for one scan line, after ZXing's global histogram binarizer: the threshold is the emptiest bucket between the
 * two strongest peaks, and a small sharpening pass keeps thin bars from washing out. `null` when the line is too flat.
 */
export function binarize_by_histogram(line: Uint8Array): Uint8Array | null {
  const buckets = new Uint32Array(BUCKETS);
  for (const value of line) buckets[value >> 3]++;
  let first = 0;
  for (let i = 1; i < BUCKETS; i++) if (buckets[i] > buckets[first]) first = i;
  let second = 0;
  let second_score = 0;
  for (let i = 0; i < BUCKETS; i++) {
    const score = buckets[i] * (i - first) * (i - first);
    if (score > second_score) {
      second = i;
      second_score = score;
    }
  }
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  if (second_score === 0 || high - low <= BUCKETS / 16) return null;
  const tallest = buckets[first];
  let valley = high - 1;
  let valley_score = -1;
  for (let x = high - 1; x > low; x--) {
    const score = (x - low) * (x - low) * (high - x) * (tallest - buckets[x]);
    if (score > valley_score) {
      valley = x;
      valley_score = score;
    }
  }
  const threshold = valley << 3;
  const dark = new Uint8Array(line.length);
  for (let x = 0; x < line.length; x++) {
    const left = line[x - 1] ?? line[x];
    const right = line[x + 1] ?? line[x];
    dark[x] = (line[x] * 4 - left - right) / 2 < threshold ? 1 : 0;
  }
  return dark;
}

/** Dark/light against the mean of the surrounding stretch, for lines where lighting changes along the code. */
export function binarize_locally(line: Uint8Array): Uint8Array {
  const reach = Math.max(8, Math.round(line.length / 16));
  const sums = new Float64Array(line.length + 1);
  for (let x = 0; x < line.length; x++) sums[x + 1] = sums[x] + line[x];
  const dark = new Uint8Array(line.length);
  for (let x = 0; x < line.length; x++) {
    const from = Math.max(0, x - reach);
    const to = Math.min(line.length, x + reach + 1);
    dark[x] = line[x] < (sums[to] - sums[from]) / (to - from) - 8 ? 1 : 0;
  }
  return dark;
}

const MIN_CONTRAST = 40;

function sliding(line: Uint8Array, reach: number, keep: (kept: number, next: number) => boolean): Uint8Array {
  const out = new Uint8Array(line.length);
  const queue = new Int32Array(line.length);
  let head = 0;
  let tail = 0;
  let added = 0;
  for (let x = 0; x < line.length; x++) {
    for (; added < Math.min(line.length, x + reach + 1); added++) {
      while (tail > head && !keep(line[queue[tail - 1]], line[added])) tail--;
      queue[tail++] = added;
    }
    while (queue[head] < x - reach) head++;
    out[x] = line[queue[head]];
  }
  return out;
}

/**
 * Dark/light against the middle of the darkest and lightest values nearby. A blurred edge crosses that middle where the
 * sharp edge was, so bars keep their widths; a stretch with no contrast (a quiet zone) counts as light.
 */
export function binarize_by_midrange(line: Uint8Array): Uint8Array {
  const reach = Math.max(12, Math.round(line.length / 24));
  const low = sliding(line, reach, (kept, next) => kept < next);
  const high = sliding(line, reach, (kept, next) => kept > next);
  const dark = new Uint8Array(line.length);
  for (let x = 0; x < line.length; x++) {
    dark[x] = high[x] - low[x] >= MIN_CONTRAST && line[x] * 2 < low[x] + high[x] ? 1 : 0;
  }
  return dark;
}

/** Widths of alternating light and dark stretches, starting with light (zero wide when the line starts dark). */
export function runs_of(dark: Uint8Array): number[] {
  const runs: number[] = dark[0] ? [0] : [];
  let count = 0;
  let current = dark[0];
  for (const value of dark) {
    if (value === current) count++;
    else {
      runs.push(count);
      current = value;
      count = 1;
    }
  }
  runs.push(count);
  return runs;
}

interface Decoder {
  formats: readonly LinearFormat[];
  decode: (runs: readonly number[], start: number) => string | null;
  format: (value: string, wanted: readonly string[]) => LinearFormat;
  // Without a checksum one line could misread, so another line has to agree.
  confirm: boolean;
}

const DECODERS: readonly Decoder[] = [
  {
    formats: [LinearFormat.EAN_13, LinearFormat.UPC_A],
    decode: decode_ean13,
    format: (value, wanted) => (value[0] === "0" && wanted.includes(LinearFormat.UPC_A) && !wanted.includes(LinearFormat.EAN_13) ? LinearFormat.UPC_A : LinearFormat.EAN_13),
    confirm: false,
  },
  { formats: [LinearFormat.EAN_8], decode: decode_ean8, format: () => LinearFormat.EAN_8, confirm: false },
  { formats: [LinearFormat.UPC_E], decode: decode_upce, format: () => LinearFormat.UPC_E, confirm: false },
  { formats: [LinearFormat.CODE_128], decode: decode_code128, format: () => LinearFormat.CODE_128, confirm: false },
  { formats: [LinearFormat.CODE_39], decode: decode_code39, format: () => LinearFormat.CODE_39, confirm: true },
];

function read_line(runs: readonly number[], decoders: readonly Decoder[], wanted: readonly string[]): { code: LinearCode; confirm: boolean } | null {
  for (let start = 1; start < runs.length; start += 2) {
    for (const decoder of decoders) {
      const value = decoder.decode(runs, start);
      if (value === null) continue;
      const format = decoder.format(value, wanted);
      return { code: { value: format === LinearFormat.UPC_A ? value.slice(1) : value, format }, confirm: decoder.confirm };
    }
  }
  return null;
}

// Scan lines from the middle outwards: a code held up to the camera is usually near the centre.
const LINE_SPOTS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];

// Bars run across the scan line, so averaging a few neighbouring lines takes out sensor noise and keeps the edges.
const LINE_SPREAD = 2;

function lines_of(image: Gray): Uint8Array[] {
  const { data, width, height } = image;
  const lines: Uint8Array[] = [];
  const average = (length: number, at: (offset: number, i: number) => number, center: number, limit: number) => {
    const line = new Uint8Array(length);
    const from = Math.max(0, center - LINE_SPREAD);
    const to = Math.min(limit - 1, center + LINE_SPREAD);
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let offset = from; offset <= to; offset++) sum += at(offset, i);
      line[i] = sum / (to - from + 1);
    }
    return line;
  };
  for (const spot of LINE_SPOTS) {
    const y = Math.min(height - 1, Math.floor(height * spot));
    lines.push(average(width, (row, x) => data[row * width + x], y, height));
  }
  for (const spot of LINE_SPOTS) {
    const x = Math.min(width - 1, Math.floor(width * spot));
    lines.push(average(height, (column, y) => data[y * width + column], x, width));
  }
  return lines;
}

/**
 * Finds a 1D barcode (EAN-13, UPC-A, EAN-8, UPC-E, Code 128 or Code 39, of those in `formats`) along horizontal and
 * vertical scan lines, either way round. Used where the browser has no `BarcodeDetector` for them.
 */
export function decode_linear(image: Gray, formats: readonly string[]): LinearCode | null {
  const decoders = DECODERS.filter((decoder) => decoder.formats.some((format) => formats.includes(format)));
  if (decoders.length === 0 || image.width < 2 || image.height < 2) return null;
  const unconfirmed = new Map<string, number>();
  for (const line of lines_of(image)) {
    const on_line = new Map<string, LinearCode>();
    for (const dark of [binarize_by_midrange(line), binarize_by_histogram(line), binarize_locally(line)]) {
      if (!dark) continue;
      for (const runs of [runs_of(dark), runs_of(dark.slice().reverse())]) {
        const found = read_line(runs, decoders, formats);
        if (!found) continue;
        if (!found.confirm) return found.code;
        on_line.set(`${found.code.format}:${found.code.value}`, found.code);
      }
    }
    for (const [key, code] of on_line) {
      const seen = (unconfirmed.get(key) ?? 0) + 1;
      if (seen >= 2) return code;
      unconfirmed.set(key, seen);
    }
  }
  return null;
}
