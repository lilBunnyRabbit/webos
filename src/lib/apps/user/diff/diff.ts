import { Change, diff, type Chunk } from "@codemirror/merge";
import type { Text } from "@codemirror/state";

export const DiffMode = { SPLIT: "split", UNIFIED: "unified" } as const;
export type DiffMode = (typeof DiffMode)[keyof typeof DiffMode];

export const SPLIT_MIN_WIDTH = 640;

export function default_mode(width: number): DiffMode {
  return width < SPLIT_MIN_WIDTH ? DiffMode.UNIFIED : DiffMode.SPLIT;
}

/** What `@codemirror/merge` uses by default; giving our own `diffConfig` replaces it. */
export const SCAN_LIMIT = 500;

// Newlines stay: unchanged stretches must keep the same line count on both sides, or the views can't line them up.
const INLINE_SPACE = /[ \t\f\v\u00a0]/;

interface Stripped {
  text: string;
  offsets: number[];
}

export function strip_inline_space(source: string): Stripped {
  const parts: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (INLINE_SPACE.test(source[i])) continue;
    parts.push(source[i]);
    offsets.push(i);
  }
  return { text: parts.join(""), offsets };
}

function map_range(stripped: Stripped, source: string, from: number, to: number): [number, number] {
  const start = from < stripped.offsets.length ? stripped.offsets[from] : source.length;
  return from === to ? [start, start] : [start, stripped.offsets[to - 1] + 1];
}

export function ignore_whitespace_diff(a: string, b: string): readonly Change[] {
  const stripped_a = strip_inline_space(a);
  const stripped_b = strip_inline_space(b);
  return diff(stripped_a.text, stripped_b.text, { scanLimit: SCAN_LIMIT }).map((change) => {
    const [from_a, to_a] = map_range(stripped_a, a, change.fromA, change.toA);
    const [from_b, to_b] = map_range(stripped_b, b, change.fromB, change.toB);
    return new Change(from_a, to_a, from_b, to_b);
  });
}

export interface DiffSummary {
  changes: number;
  added: number;
  removed: number;
}

function line_span(doc: Text, from: number, to: number, end: number): number {
  return from === to ? 0 : doc.lineAt(end).number - doc.lineAt(from).number + 1;
}

export function summarize(chunks: readonly Chunk[], a: Text, b: Text): DiffSummary {
  let added = 0;
  let removed = 0;
  for (const chunk of chunks) {
    removed += line_span(a, chunk.fromA, chunk.toA, chunk.endA);
    added += line_span(b, chunk.fromB, chunk.toB, chunk.endB);
  }
  return { changes: chunks.length, added, removed };
}

function line_after(doc: Text, pos: number): number {
  return pos > doc.length ? doc.lines + 1 : doc.lineAt(pos).number;
}

/**
 * The line on the other side matching an unchanged `line`, counted in lines rather than characters, so it stays right
 * when ignored whitespace makes the two sides' unchanged text differ in length.
 */
export function map_line(chunks: readonly Chunk[], line: number, side: "a" | "b", a: Text, b: Text): number {
  const [ours, theirs] = side === "a" ? [a, b] : [b, a];
  let start_ours = 1;
  let start_theirs = 1;
  for (const chunk of chunks) {
    const [to_ours, to_theirs] = side === "a" ? [chunk.toA, chunk.toB] : [chunk.toB, chunk.toA];
    const end_ours = line_after(ours, to_ours);
    if (end_ours > line) break;
    start_ours = end_ours;
    start_theirs = line_after(theirs, to_theirs);
  }
  return start_theirs + (line - start_ours);
}
