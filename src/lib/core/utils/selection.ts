import type { Position } from "./type";

/** Multi-select shared by the desktop and File Explorer (ADR-011 revision): click rules and rectangle hit-testing. */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ClickModifiers {
  /** Ctrl (Cmd on macOS): add or remove one. */
  toggle: boolean;
  /** Shift: everything from the anchor to here. */
  range: boolean;
}

export interface SelectionState {
  selection: Set<string>;
  /** Where the next Shift+click range starts. */
  anchor: string | null;
}

export function rect_from_points(a: Position, b: Position): Rect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function same_members<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/** The selection after a click on `name`. `order` is the surface's reading order, for ranges. */
export function click_select(state: SelectionState, name: string, modifiers: ClickModifiers, order: string[]): SelectionState {
  const { selection, anchor } = state;

  if (modifiers.range && anchor !== null && order.includes(anchor)) {
    const [from, to] = [order.indexOf(anchor), order.indexOf(name)].sort((a, b) => a - b);
    const range = order.slice(from, to + 1);
    return { selection: new Set(modifiers.toggle ? [...selection, ...range] : range), anchor };
  }

  if (modifiers.toggle) {
    const next = new Set(selection);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return { selection: next, anchor: name };
  }

  return { selection: new Set([name]), anchor: name };
}
