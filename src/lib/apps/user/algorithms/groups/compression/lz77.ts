export type Triple = [distance: number, length: number, character: string];

export interface MatchStep {
  i: number;
  distance: number;
  length: number;
  character: string;
  search_from: number;
  look_to: number;
}

export interface Candidate {
  distance: number;
  length: number;
}

export function candidates(data: string, i: number, search_buffer: number, look_ahead: number): Candidate[] {
  const found: Candidate[] = [];
  const limit = Math.min(look_ahead, data.length - i - 1);
  if (limit <= 0) return found;
  for (let j = i - 1; j >= Math.max(0, i - search_buffer); j--) {
    if (data[j] !== data[i]) continue;
    const distance = i - j;
    let k = 1;
    while (k < limit && data[i + k] === data[j + (k % distance)]) k++;
    found.push({ distance, length: k });
  }
  return found;
}

export function best_of(found: Candidate[]): Candidate {
  let best: Candidate = { distance: 0, length: 0 };
  for (const candidate of found) if (candidate.length > best.length) best = candidate;
  return best;
}

export function lz77_steps(data: string, search_buffer = 255, look_ahead = 255): MatchStep[] {
  const steps: MatchStep[] = [];
  for (let i = 0; i < data.length; i++) {
    const search_from = Math.max(0, i - search_buffer);
    const { distance, length } = best_of(candidates(data, i, search_buffer, look_ahead));
    steps.push({ i, distance, length, character: data[i + length], search_from, look_to: Math.min(data.length, i + look_ahead + 1) });
    i += length;
  }
  return steps;
}

export function lz77_encode(data: string, search_buffer = 255, look_ahead = 255): Triple[] {
  return lz77_steps(data, search_buffer, look_ahead).map((step) => [step.distance, step.length, step.character]);
}

export function lz77_decode(dict: Triple[]): string {
  let data = "";
  for (const [distance, length, character] of dict) {
    let prefix = "";
    const offset = data.length - distance;
    for (let j = 0; j < length; j++) prefix += data[offset + (j % distance)];
    data += prefix + character;
  }
  return data;
}

export function dict_to_string(dict: Triple[]): string {
  return dict.map(([d, l, c]) => `(${d}, ${l}, ${c})`).join("");
}

export function dict_to_bin(dict: Triple[]): string {
  let max_bits = 1;
  for (const [d, l, c] of dict) max_bits = Math.max(max_bits, d.toString(2).length, l.toString(2).length, c.charCodeAt(0).toString(2).length);
  const bytes = Math.ceil(max_bits / 8);
  const bits = 8 * bytes;
  let bin = bytes.toString(2).padStart(2, "0");
  for (const [d, l, c] of dict) bin += d.toString(2).padStart(bits, "0") + l.toString(2).padStart(bits, "0") + c.charCodeAt(0).toString(2).padStart(bits, "0");
  return bin;
}

export function bin_to_dict(bin: string): Triple[] {
  const bytes = Number.parseInt(bin.substring(0, 2), 2);
  const bits = 8 * bytes;
  const dict: Triple[] = [];
  for (let i = 2; i + bits * 3 <= bin.length; i += bits * 3) {
    dict.push([
      Number.parseInt(bin.substring(i, i + bits), 2),
      Number.parseInt(bin.substring(i + bits, i + 2 * bits), 2),
      String.fromCharCode(Number.parseInt(bin.substring(i + 2 * bits, i + 3 * bits), 2)),
    ]);
  }
  return dict;
}

export const decode_from_bin = (bin: string) => lz77_decode(bin_to_dict(bin));
