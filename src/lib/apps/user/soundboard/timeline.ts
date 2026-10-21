export interface Segment {
  start: number;
  end: number;
}

/** Where each kept segment starts in the edited sound; every seam after the first overlaps by `fade` seconds. */
function offsets(segments: readonly Segment[], fade: number): number[] {
  const out: number[] = [];
  let position = 0;
  segments.forEach((segment, index) => {
    const length = segment.end - segment.start;
    const overlap = index > 0 ? Math.min(fade, length, segments[index - 1].end - segments[index - 1].start) : 0;
    position -= overlap;
    out.push(position);
    position += length;
  });
  return out;
}

/** The source time a moment of the edited sound came from. */
export function source_time(segments: readonly Segment[], time: number, fade: number): number {
  if (segments.length === 0) return time;
  const starts = offsets(segments, fade);
  let index = 0;
  while (index + 1 < segments.length && time >= starts[index + 1]) index++;
  const segment = segments[index];
  return Math.max(segment.start, Math.min(segment.end, segment.start + (time - starts[index])));
}

/** The segments left after deleting `span` (edited time) from the sound they make up. */
export function remove_span(segments: readonly Segment[], span: Segment, fade: number): Segment[] {
  const starts = offsets(segments, fade);
  return segments.flatMap((segment, index) => {
    const from = starts[index];
    const to = from + (segment.end - segment.start);
    const cut_start = Math.max(from, span.start);
    const cut_end = Math.min(to, span.end);
    if (cut_end <= cut_start) return [segment];
    const kept: Segment[] = [];
    if (cut_start > from) kept.push({ start: segment.start, end: segment.start + (cut_start - from) });
    if (cut_end < to) kept.push({ start: segment.start + (cut_end - from), end: segment.end });
    return kept;
  });
}

export interface Marks {
  start: number;
  end: number;
  selection: Segment | null;
}

/** The mark the user just moved, so the preview can show that moment; `null` when nothing moved. */
export function moved_mark(before: Marks, after: Marks): number | null {
  if (after.selection) {
    if (!before.selection) return after.selection.start;
    if (after.selection.end !== before.selection.end && after.selection.start === before.selection.start) return after.selection.end;
    if (after.selection.start !== before.selection.start) return after.selection.start;
  }
  if (after.start !== before.start) return after.start;
  if (after.end !== before.end) return after.end;
  return null;
}
