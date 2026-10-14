import type { Attachment } from "svelte/attachments";

const THRESHOLD = 5;
const EDGE = 40;

interface Pending {
  pointer: number;
  x: number;
  y: number;
  index: number;
}

// Touch and pen drag only from a `data-reorder-grip`, so a finger elsewhere still scrolls the list.
export class ReorderHandler {
  from = $state<number | null>(null);
  slot = $state<number | null>(null);
  private pending: Pending | null = null;

  constructor(
    private readonly axis: "x" | "y",
    private readonly on_move: (from: number, slot: number) => void
  ) {}

  attachment(): Attachment<HTMLElement> {
    return (container) => {
      const items = () => [...container.querySelectorAll<HTMLElement>("[data-reorder-index]")];

      const slot_at = (x: number, y: number): number | null => {
        let best: { index: number; distance: number; rect: DOMRect } | null = null;
        for (const item of items()) {
          const rect = item.getBoundingClientRect();
          const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
          if (!best || distance < best.distance) best = { index: Number(item.dataset.reorderIndex), distance, rect };
        }
        if (!best) return null;
        const before = this.axis === "x" ? x < best.rect.left + best.rect.width / 2 : y < best.rect.top + best.rect.height / 2;
        return before ? best.index : best.index + 1;
      };

      const scroll_edge = (y: number) => {
        let parent = container.parentElement;
        while (parent && parent.scrollHeight <= parent.clientHeight) parent = parent.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        if (y < rect.top + EDGE) parent.scrollBy({ top: -12 });
        else if (y > rect.bottom - EDGE) parent.scrollBy({ top: 12 });
      };

      const reset = () => {
        this.pending = null;
        this.from = null;
        this.slot = null;
      };

      const on_down = (event: PointerEvent) => {
        if (event.button !== 0 || !(event.target instanceof Element)) return;
        const item = event.target.closest<HTMLElement>("[data-reorder-index]");
        if (!item || !container.contains(item)) return;
        const grip = event.target.closest("[data-reorder-grip]");
        if (event.pointerType !== "mouse" && !grip) return;
        if (!grip && event.target.closest("button, input, select, a")) return;
        this.pending = { pointer: event.pointerId, x: event.clientX, y: event.clientY, index: Number(item.dataset.reorderIndex) };
        if (grip) event.preventDefault();
      };

      const on_move = (event: PointerEvent) => {
        const pending = this.pending;
        if (!pending || event.pointerId !== pending.pointer) return;
        if (this.from === null) {
          if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < THRESHOLD) return;
          this.from = pending.index;
          container.setPointerCapture(event.pointerId);
        }
        this.slot = slot_at(event.clientX, event.clientY);
        scroll_edge(event.clientY);
      };

      const on_up = (event: PointerEvent) => {
        if (!this.pending || event.pointerId !== this.pending.pointer) return;
        const { from, slot } = this;
        if (from !== null) {
          // The pointerup that ends a drag would otherwise click the item under it.
          const swallow = (click: MouseEvent) => click.stopPropagation();
          container.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => container.removeEventListener("click", swallow, true));
          if (slot !== null) this.on_move(from, slot);
        }
        reset();
      };

      const on_key = (event: KeyboardEvent) => {
        if (event.key === "Escape" && this.from !== null) {
          event.stopPropagation();
          reset();
        }
      };

      container.addEventListener("pointerdown", on_down);
      container.addEventListener("pointermove", on_move);
      container.addEventListener("pointerup", on_up);
      container.addEventListener("lostpointercapture", on_up);
      window.addEventListener("keydown", on_key, true);
      return () => {
        container.removeEventListener("pointerdown", on_down);
        container.removeEventListener("pointermove", on_move);
        container.removeEventListener("pointerup", on_up);
        container.removeEventListener("lostpointercapture", on_up);
        window.removeEventListener("keydown", on_key, true);
      };
    };
  }
}
