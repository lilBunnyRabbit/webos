export interface Slot {
  top: number;
  height: number;
}

/**
 * Where the dragged item lands. It passes a neighbour once its leading edge crosses that neighbour's middle, so a tall
 * widget held at the end of the list still reaches the last place.
 */
export function drop_index(slots: Slot[], from: number, offset: number): number {
  const top = slots[from].top + offset;
  const bottom = top + slots[from].height;
  const middle = (index: number) => slots[index].top + slots[index].height / 2;
  let to = from;
  for (let index = from + 1; index < slots.length && bottom > middle(index); index++) to = index;
  for (let index = from - 1; index >= 0 && top < middle(index); index--) to = index;
  return to;
}

export function shift_of(index: number, from: number, to: number, stride: number): number {
  if (from < to && index > from && index <= to) return -stride;
  if (to < from && index >= to && index < from) return stride;
  return 0;
}

/** The dragged item's offset, kept inside the list so it can't grow the scroll area under itself. */
export function clamp_offset(slots: Slot[], from: number, offset: number): number {
  const dragged = slots[from];
  const last = slots[slots.length - 1];
  const min = slots[0].top - dragged.top;
  const max = last.top + last.height - dragged.top - dragged.height;
  return Math.min(max, Math.max(min, offset));
}

export function autoscroll_step(y: number, top: number, bottom: number, edge = 64, max = 14): number {
  if (y < top + edge) return -Math.round(max * Math.min(1, (top + edge - y) / edge));
  if (y > bottom - edge) return Math.round(max * Math.min(1, (y - bottom + edge) / edge));
  return 0;
}

export function before_of(names: string[], from: number, to: number): string | null {
  const others = names.filter((_, index) => index !== from);
  return others[to] ?? null;
}
