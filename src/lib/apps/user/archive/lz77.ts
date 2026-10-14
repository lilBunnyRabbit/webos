export interface Lz77Literal {
  kind: "literal";
  start: number;
  text: string;
}

export interface Lz77Match {
  kind: "match";
  start: number;
  length: number;
  distance: number;
  text: string;
}

export type Lz77Token = Lz77Literal | Lz77Match;

export interface Lz77Options {
  window?: number;
  min_length?: number;
  max_length?: number;
  chain?: number;
}

export interface Lz77Stats {
  literals: number;
  matches: number;
  matched_chars: number;
  chars: number;
}

// Counts code points, not UTF-16 units, so an emoji is never split across a literal and a match.
export function lz77(text: string, options: Lz77Options = {}): Lz77Token[] {
  const { window = 32768, min_length = 3, max_length = 258, chain = 64 } = options;
  const chars = Array.from(text);
  const heads = new Map<string, number[]>();
  const tokens: Lz77Token[] = [];

  const key = (i: number) => chars[i] + "\u0000" + chars[i + 1] + "\u0000" + chars[i + 2];
  const remember = (i: number) => {
    if (i + min_length > chars.length) return;
    const k = key(i);
    const list = heads.get(k);
    if (list) list.push(i);
    else heads.set(k, [i]);
  };

  let i = 0;
  while (i < chars.length) {
    let best_length = 0;
    let best_distance = 0;
    if (i + min_length <= chars.length) {
      const candidates = heads.get(key(i)) ?? [];
      for (let c = candidates.length - 1, tried = 0; c >= 0 && tried < chain; c--, tried++) {
        const from = candidates[c];
        if (i - from > window) break;
        let length = 0;
        while (length < max_length && i + length < chars.length && chars[from + length] === chars[i + length]) length++;
        if (length > best_length) {
          best_length = length;
          best_distance = i - from;
        }
      }
    }

    if (best_length >= min_length) {
      tokens.push({ kind: "match", start: i, length: best_length, distance: best_distance, text: chars.slice(i, i + best_length).join("") });
      for (let j = i; j < i + best_length; j++) remember(j);
      i += best_length;
    } else {
      const last = tokens.at(-1);
      if (last?.kind === "literal") last.text += chars[i];
      else tokens.push({ kind: "literal", start: i, text: chars[i] });
      remember(i);
      i++;
    }
  }
  return tokens;
}

export function lz77_decode(tokens: Lz77Token[]): string {
  const out: string[] = [];
  for (const token of tokens) {
    if (token.kind === "literal") out.push(...Array.from(token.text));
    else for (let k = 0; k < token.length; k++) out.push(out[out.length - token.distance]);
  }
  return out.join("");
}

export function lz77_stats(tokens: Lz77Token[]): Lz77Stats {
  const stats: Lz77Stats = { literals: 0, matches: 0, matched_chars: 0, chars: 0 };
  for (const token of tokens) {
    if (token.kind === "literal") {
      const count = Array.from(token.text).length;
      stats.literals += count;
      stats.chars += count;
    } else {
      stats.matches++;
      stats.matched_chars += token.length;
      stats.chars += token.length;
    }
  }
  return stats;
}

export interface Lz77Segment {
  text: string;
  token: number;
  kind: Lz77Token["kind"];
  in_source: boolean;
}

export function source_range(token: Lz77Match): { start: number; end: number } {
  const start = token.start - token.distance;
  return { start, end: start + token.length };
}

export function lz77_segments(tokens: Lz77Token[], source?: { start: number; end: number }): Lz77Segment[] {
  const segments: Lz77Segment[] = [];
  tokens.forEach((token, index) => {
    const chars = Array.from(token.text);
    const cuts = source
      ? [0, source.start - token.start, source.end - token.start, chars.length].map((cut) => Math.min(chars.length, Math.max(0, cut)))
      : [0, chars.length];
    for (let c = 0; c < cuts.length - 1; c++) {
      if (cuts[c] === cuts[c + 1]) continue;
      segments.push({ text: chars.slice(cuts[c], cuts[c + 1]).join(""), token: index, kind: token.kind, in_source: Boolean(source) && c === 1 });
    }
  });
  return segments;
}
