import type { EditorJson } from "./format";
import { blocks_of, flat_blocks, has_text } from "./model";

export const HISTORY_INTERVAL = 5 * 60_000;
export const HISTORY_EXTENSION = ".warren";

const DAY = 24 * 60 * 60_000;
export const DAILY_FOR = 30 * DAY;

export interface Snapshot {
  at: number;
  words: number;
  name: string;
}

// The word count rides in the name, so the list shows it without opening every snapshot.
export function snapshot_name(at: number, words: number): string {
  return `${Math.round(at)}-${Math.max(0, Math.round(words))}${HISTORY_EXTENSION}`;
}

export function parse_snapshot_name(name: string): Snapshot | null {
  const match = /^(\d{10,16})-(\d{1,9})\.warren$/.exec(name);
  return match ? { at: Number(match[1]), words: Number(match[2]), name } : null;
}

function day_start(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function week_start(at: number): number {
  const date = new Date(day_start(at));
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

// A snapshot from the future (a clock moved back) counts as today, so it's never thinned away.
export function to_thin(snapshots: Snapshot[], now: number): Snapshot[] {
  const today = day_start(now);
  const kept = new Map<string, Snapshot>();
  const dropped: Snapshot[] = [];
  for (const snapshot of [...snapshots].sort((a, b) => b.at - a.at)) {
    if (snapshot.at >= today) continue;
    const bucket = now - snapshot.at < DAILY_FOR ? `d${day_start(snapshot.at)}` : `w${week_start(snapshot.at)}`;
    if (kept.has(bucket)) dropped.push(snapshot);
    else kept.set(bucket, snapshot);
  }
  return dropped;
}

export function paragraphs_of(editor: EditorJson): string[] {
  return flat_blocks(blocks_of(editor)).flatMap((block) => {
    if (block.kind === "image") return [`[Picture${block.alt ? `: ${block.alt}` : ""}]`];
    if (!has_text(block)) return [];
    const text = block.runs.map((run) => run.text).join("").trim();
    return text ? [text] : [];
  });
}

export const DiffKind = { SAME: "same", ADDED: "added", REMOVED: "removed" } as const;
export type DiffKind = (typeof DiffKind)[keyof typeof DiffKind];

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export function diff_paragraphs(before: string[], after: string[]): DiffLine[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i * width + j] = a[i] === b[j] ? lengths[(i + 1) * width + j + 1] + 1 : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      middle.push({ kind: DiffKind.SAME, text: a[i] });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
      middle.push({ kind: DiffKind.REMOVED, text: a[i++] });
    } else {
      middle.push({ kind: DiffKind.ADDED, text: b[j++] });
    }
  }
  const same = (text: string): DiffLine => ({ kind: DiffKind.SAME, text });
  return [...before.slice(0, start).map(same), ...middle, ...before.slice(before.length - end).map(same)];
}
