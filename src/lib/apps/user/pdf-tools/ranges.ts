export type RangeResult = { ok: true; groups: number[][] } | { ok: false; error: string };

// `8-` runs to the end, `-3` starts at 1, `5-3` counts down.
export function parse_ranges(text: string, count: number): RangeResult {
  const parts = text
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Enter pages, like 1-3, 5" };

  const groups: number[][] = [];
  for (const part of parts) {
    const match = /^(\d*)\s*(?:([-–])\s*(\d*))?$/.exec(part);
    if (!match || (match[1] === "" && (match[3] ?? "") === "")) return { ok: false, error: `“${part}” isn't a page or a range` };
    const start = match[1] === "" ? 1 : Number(match[1]);
    const end = match[2] ? (match[3] ? Number(match[3]) : count) : start;
    for (const page of [start, end]) {
      if (page < 1 || page > count) return { ok: false, error: count === 1 ? "This PDF has 1 page" : `Pages go from 1 to ${count}` };
    }
    const step = end >= start ? 1 : -1;
    const group: number[] = [];
    for (let page = start; page !== end + step; page += step) group.push(page);
    groups.push(group);
  }
  return { ok: true, groups };
}

export function flatten_groups(groups: number[][]): number[] {
  return [...new Set(groups.flat())];
}

export function every_page(count: number): number[][] {
  return Array.from({ length: count }, (_, index) => [index + 1]);
}

export function chunks(count: number, size: number): number[][] {
  const step = Math.max(1, Math.floor(size));
  const groups: number[][] = [];
  for (let start = 1; start <= count; start += step) {
    groups.push(Array.from({ length: Math.min(step, count - start + 1) }, (_, index) => start + index));
  }
  return groups;
}

export interface SplitOptions {
  ranges?: string;
  every?: number;
}

export function split_groups(count: number, { ranges, every }: SplitOptions): RangeResult {
  if (ranges !== undefined && every !== undefined) return { ok: false, error: "Use --ranges or --every, not both" };
  if (ranges !== undefined) return parse_ranges(ranges, count);
  if (every !== undefined) return every >= 1 ? { ok: true, groups: chunks(count, every) } : { ok: false, error: "--every needs at least 1" };
  return { ok: true, groups: every_page(count) };
}
