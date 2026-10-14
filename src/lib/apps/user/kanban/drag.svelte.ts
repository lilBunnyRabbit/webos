import { long_press } from "$lib/core/utils/long-press";
import type { Position } from "$lib/core/utils/type";
import type { Attachment } from "svelte/attachments";

export const DragKind = { CARD: "card", COLUMN: "column" } as const;
export type DragKind = (typeof DragKind)[keyof typeof DragKind];

/** Where a drop lands: before `before` (an id) in `column`, or at the end when `before` is null. Columns ignore `column`. */
export interface DropTarget {
  column: string | null;
  before: string | null;
}

interface Ghost {
  x: number;
  y: number;
  width: number;
}

const THRESHOLD_PX = 4;
const EDGE_PX = 48;
const STEP_PX = 14;
const PAGE_DWELL_MS = 550;
const INTERACTIVE = "button, input, textarea, select, a, [contenteditable]";

/**
 * Pointer drag for cards and columns. A mouse drags after a few pixels; touch drags after a long press, so swiping
 * still scrolls the column pages. Columns are found by `data-column`, cards by `data-card`, scrolling lists by
 * `data-column-list`, all inside `root`.
 */
export class BoardDrag {
  kind = $state<DragKind | null>(null);
  id = $state<string | null>(null);
  target = $state<DropTarget | null>(null);
  ghost = $state<Ghost | null>(null);

  root: HTMLElement | null = null;
  scroller: HTMLElement | null = null;

  private offset: Position = { x: 0, y: 0 };
  private pointer: Position = { x: 0, y: 0 };
  private frame = 0;
  private edge_since = 0;
  private abort: AbortController | null = null;

  constructor(private readonly on_drop: (kind: DragKind, id: string, target: DropTarget) => void) {}

  get active(): boolean {
    return this.kind !== null;
  }

  start(kind: DragKind, id: string, point: Position, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    this.offset = { x: point.x - rect.left, y: point.y - rect.top };
    this.kind = kind;
    this.id = id;
    this.ghost = { x: 0, y: 0, width: rect.width };
    this.abort = new AbortController();
    window.addEventListener("keydown", (event) => event.key === "Escape" && this.end(false), { signal: this.abort.signal });
    this.move(point);
    this.frame = requestAnimationFrame(this.tick);
  }

  move(point: Position): void {
    this.pointer = point;
    const origin = this.root?.getBoundingClientRect() ?? { left: 0, top: 0 };
    if (this.ghost) this.ghost = { ...this.ghost, x: point.x - this.offset.x - origin.left, y: point.y - this.offset.y - origin.top };
    this.target = this.resolve(point);
  }

  end(commit: boolean): void {
    cancelAnimationFrame(this.frame);
    this.abort?.abort();
    const { kind, id, target } = this;
    this.kind = null;
    this.id = null;
    this.target = null;
    this.ghost = null;
    this.edge_since = 0;
    if (commit && kind && id && target) this.on_drop(kind, id, target);
  }

  mouse(kind: DragKind, id: () => string): Attachment<HTMLElement> {
    return (element) => {
      let start: Position | null = null;
      let pointer_id: number | null = null;
      let dragged = false;

      function on_down(event: PointerEvent) {
        if (event.pointerType === "touch" || event.button !== 0) return;
        const hit = (event.target as Element).closest(INTERACTIVE);
        if (hit && hit !== element && element.contains(hit)) return;
        start = { x: event.clientX, y: event.clientY };
        pointer_id = event.pointerId;
        dragged = false;
      }

      const on_move = (event: PointerEvent) => {
        if (event.pointerId !== pointer_id || !start) return;
        const point = { x: event.clientX, y: event.clientY };
        if (!this.active && !dragged) {
          if (Math.hypot(point.x - start.x, point.y - start.y) < THRESHOLD_PX) return;
          dragged = true;
          element.setPointerCapture(event.pointerId);
          this.start(kind, id(), start, element);
        }
        if (this.active) this.move(point);
      };

      const on_up = (event: PointerEvent) => {
        if (event.pointerId !== pointer_id) return;
        if (dragged && this.active) this.end(true);
        start = null;
        pointer_id = null;
      };

      // Fires however the gesture ends (pointerup, cancel, the element leaving the DOM).
      const on_lost = () => {
        if (dragged && this.active) this.end(false);
        start = null;
        pointer_id = null;
      };

      function on_click(event: MouseEvent) {
        if (!dragged) return;
        dragged = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }

      element.addEventListener("pointerdown", on_down);
      element.addEventListener("pointermove", on_move);
      element.addEventListener("pointerup", on_up);
      element.addEventListener("lostpointercapture", on_lost);
      element.addEventListener("click", on_click, { capture: true });
      return () => {
        element.removeEventListener("pointerdown", on_down);
        element.removeEventListener("pointermove", on_move);
        element.removeEventListener("pointerup", on_up);
        element.removeEventListener("lostpointercapture", on_lost);
        element.removeEventListener("click", on_click, { capture: true });
      };
    };
  }

  touch(kind: DragKind, id: () => string, on_menu: (point: Position, element: HTMLElement) => void): Attachment<HTMLElement> {
    return (element) =>
      long_press({
        on_menu: (point) => on_menu(point, element),
        on_drag_start: (point) => this.start(kind, id(), point, element),
        on_drag_move: (point) => this.move(point),
        on_drag_end: () => this.end(true),
        on_drag_cancel: () => this.end(false),
        ignore: kind === DragKind.COLUMN ? "button" : undefined,
      })(element);
  }

  private resolve(point: Position): DropTarget | null {
    if (!this.root || !this.id) return null;
    const columns = [...this.root.querySelectorAll<HTMLElement>("[data-column]")];
    if (this.kind === DragKind.COLUMN) {
      const rest = columns.filter((column) => column.dataset.column !== this.id);
      const before = rest.find((column) => {
        const rect = column.getBoundingClientRect();
        return point.x < rect.left + rect.width / 2;
      });
      return { column: null, before: before?.dataset.column ?? null };
    }

    const column = nearest(columns, point.x);
    if (!column) return null;
    const cards = [...column.querySelectorAll<HTMLElement>("[data-card]")].filter((card) => card.dataset.card !== this.id);
    const before = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return point.y < rect.top + rect.height / 2;
    });
    return { column: column.dataset.column!, before: before?.dataset.card ?? null };
  }

  private tick = () => {
    if (!this.active) return;
    const scrolled = this.scroll_board() || this.scroll_list();
    if (scrolled) this.target = this.resolve(this.pointer);
    this.frame = requestAnimationFrame(this.tick);
  };

  private scroll_board(): boolean {
    const scroller = this.scroller;
    if (!scroller) return false;
    const rect = scroller.getBoundingClientRect();
    const direction = this.pointer.x < rect.left + EDGE_PX ? -1 : this.pointer.x > rect.right - EDGE_PX ? 1 : 0;
    if (direction === 0) {
      this.edge_since = 0;
      return false;
    }
    // Snapping pages (narrow windows, phones) turn one page per dwell; free scrolling glides.
    if (getComputedStyle(scroller).scrollSnapType.includes("mandatory")) {
      const now = performance.now();
      if (!this.edge_since) this.edge_since = now;
      if (now - this.edge_since < PAGE_DWELL_MS) return false;
      this.edge_since = now;
      scroller.scrollBy({ left: direction * scroller.clientWidth, behavior: "smooth" });
      return true;
    }
    const before = scroller.scrollLeft;
    scroller.scrollLeft += direction * STEP_PX;
    return scroller.scrollLeft !== before;
  }

  private scroll_list(): boolean {
    if (this.kind !== DragKind.CARD || !this.root) return false;
    const lists = [...this.root.querySelectorAll<HTMLElement>("[data-column-list]")];
    const list = lists.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return this.pointer.x >= rect.left && this.pointer.x <= rect.right;
    });
    if (!list) return false;
    const rect = list.getBoundingClientRect();
    const direction = this.pointer.y < rect.top + EDGE_PX / 2 ? -1 : this.pointer.y > rect.bottom - EDGE_PX / 2 ? 1 : 0;
    if (direction === 0) return false;
    const before = list.scrollTop;
    list.scrollTop += direction * STEP_PX;
    return list.scrollTop !== before;
  }
}

function nearest(elements: HTMLElement[], x: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let distance = Infinity;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const d = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    if (d < distance) {
      distance = d;
      best = element;
    }
  }
  return best;
}
