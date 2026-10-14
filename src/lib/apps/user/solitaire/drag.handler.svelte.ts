import type { PileId } from "./klondike";

export interface DragCallbacks {
  can_pick(from: PileId, count: number): boolean;
  can_drop(from: PileId, to: PileId, count: number): boolean;
  drop(from: PileId, to: PileId, count: number): void;
  tap(from: PileId, count: number): void;
}

interface Pending {
  from: PileId;
  count: number;
  x: number;
  y: number;
  cancelled: boolean;
}

// Below this distance a press is a tap, so a shaky finger still taps.
const THRESHOLD = 6;

export class CardDrag {
  from = $state<PileId | null>(null);
  count = $state(0);
  dx = $state(0);
  dy = $state(0);
  over = $state<PileId | null>(null);

  private pending: Pending | null = null;
  private callbacks: DragCallbacks;

  constructor(callbacks: DragCallbacks) {
    this.callbacks = callbacks;
  }

  get active(): boolean {
    return this.from !== null;
  }

  holds(pile: PileId, depth: number): boolean {
    return this.from === pile && depth <= this.count;
  }

  start(event: PointerEvent, from: PileId, count: number): void {
    if (event.button !== 0 || this.pending || !this.callbacks.can_pick(from, count)) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    this.pending = { from, count, x: event.clientX, y: event.clientY, cancelled: false };

    const move = (e: PointerEvent) => this.move(e, target);
    const cancel = () => this.pending && (this.pending.cancelled = true);
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointercancel", cancel);
      target.removeEventListener("lostpointercapture", end);
      this.end();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointercancel", cancel);
    target.addEventListener("lostpointercapture", end);
  }

  private move(event: PointerEvent, target: HTMLElement): void {
    const pending = this.pending;
    if (!pending) return;
    const dx = event.clientX - pending.x;
    const dy = event.clientY - pending.y;
    if (!this.active) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      this.from = pending.from;
      this.count = pending.count;
    }
    this.dx = dx;
    this.dy = dy;
    const board = target.closest("[data-board]");
    const hit = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element instanceof HTMLElement && element.dataset.drop && board?.contains(element)) as HTMLElement | undefined;
    const to = (hit?.dataset.drop as PileId | undefined) ?? null;
    this.over = to && this.callbacks.can_drop(pending.from, to, pending.count) ? to : null;
  }

  private end(): void {
    const pending = this.pending;
    const was_drag = this.active;
    const over = this.over;
    this.pending = null;
    this.from = this.over = null;
    this.count = this.dx = this.dy = 0;
    if (!pending || pending.cancelled) return;
    if (!was_drag) this.callbacks.tap(pending.from, pending.count);
    else if (over) this.callbacks.drop(pending.from, over, pending.count);
  }
}
