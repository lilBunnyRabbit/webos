import type { Attachment } from "svelte/attachments";
import type { Bounds, WindowId } from "$lib/core/stores/window-manager/window-manager.type";
import { WM } from "$lib/core/stores";

export const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type ResizeEdge = (typeof RESIZE_EDGES)[number];

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  dx: number;
  dy: number;
  animationFrame: number;
}

interface MovingState {
  active: boolean;
  startX: number;
  startY: number;
  width: number;
  height: number;
  startLeft: number;
  startTop: number;
  dx: number;
  dy: number;
  animationFrame: number;
  container: Bounds;
}

export class WindowGeometryHandler {
  public move = $state<MovingState>({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    width: 0,
    height: 0,
    dx: 0,
    dy: 0,
    animationFrame: 0,
    container: {
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    },
  });

  private resetMove() {
    Object.assign(this.move, {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0,
      width: 0,
      height: 0,
      dx: 0,
      dy: 0,
      animationFrame: 0,
      container: {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      },
    });
  }

  private bounds: Bounds;
  private minW = 240;
  private minH = 140;

  constructor(private windowId: WindowId) {
    this.bounds = $derived(WM.windows.get(this.windowId)!.bounds);
  }

  public dragAttachment() {
    return this.createMoveAttachment((event) => {
      const { x: cx, y: cy, width: cw, height: ch } = this.move.container;
      const { startX: sx, startY: sy, startTop: st } = this.move;

      this.move.dx = Math.round(Math.max(cx, Math.min(cw + cx, event.clientX)) - sx);
      this.move.dy = Math.round(Math.max(-st, Math.min(ch + cy, event.clientY) - sy));

      /*
      this.move.dx = Math.round(Math.max(cx, Math.min(cw + cx, event.clientX)) - sx);
      this.move.dy = Math.round(Math.max(-st + sy, Math.min(ch + cy, event.clientY)) - sy);

      const ndx = Math.round(event.clientX - this.move.startX);
      const ndy = Math.round(event.clientY - this.move.startY);

      const minX = Math.round(-this.move.startX + this.move.container.x);
      const minY = -this.move.startTop;

      const maxX = Math.round(this.move.container.width - this.move.startX + this.move.container.x);
      const maxY = Math.round(this.move.container.height - this.move.startY + this.move.container.y);

      this.move.dx = Math.max(minX, Math.min(maxX, ndx));
      this.move.dy = Math.max(minY, Math.min(maxY, ndy));
      */
    });
  }

  // TODO: bounds
  public resizeAttachment(edge: ResizeEdge) {
    return this.createMoveAttachment((event) => {
      const ndx = event.clientX - this.move.startX;
      const ndy = event.clientY - this.move.startY;

      if (edge.includes("e")) {
        const nw = Math.round(this.bounds.width + ndx);
        const maxWidth = Math.round(this.move.container.width - this.move.startLeft + this.move.container.x);

        this.move.width = Math.max(this.minW, Math.min(maxWidth, nw));
      }

      if (edge.includes("w")) {
        this.move.width = Math.max(this.minW, Math.round(this.bounds.width - ndx));
        this.move.dx = this.bounds.width - this.move.width;
      }

      if (edge.includes("s")) {
        const nh = Math.round(this.bounds.height + ndy);
        const maxHeight = Math.round(this.move.container.height - this.move.startTop + this.move.container.y);

        this.move.height = Math.max(this.minH, Math.min(maxHeight, nh));
      }

      if (edge.includes("n")) {
        this.move.height = Math.max(this.minH, Math.round(this.bounds.height - ndy));
        this.move.dy = this.bounds.height - this.move.height;
      }
    });
  }

  private createMoveAttachment(handleMove: (event: PointerEvent) => void): Attachment<HTMLDivElement> {
    return (element) => {
      let pointerId: number | null = null;

      const cleanup = () => {
        element.removeEventListener("pointerdown", onDown);
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onEnd);
        element.removeEventListener("pointercancel", onEnd);

        if (pointerId !== null && element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }
      };

      const onMove = (event: PointerEvent) => {
        event.preventDefault();

        cancelAnimationFrame(this.move.animationFrame);
        this.move.animationFrame = requestAnimationFrame(() => {
          handleMove(event);
        });
      };

      const onEnd = (event: PointerEvent) => {
        event.preventDefault();

        element.releasePointerCapture(event.pointerId);

        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onEnd);
        element.removeEventListener("pointercancel", onEnd);

        cancelAnimationFrame(this.move.animationFrame);

        this.bounds.width = this.move.width;
        this.bounds.height = this.move.height;
        this.bounds.x = this.move.startLeft + this.move.dx;
        this.bounds.y = this.move.startTop + this.move.dy;

        this.resetMove();
        pointerId = null;
      };

      const onDown = (event: PointerEvent) => {
        if (
          element !== event.target &&
          event.target instanceof Element &&
          event.target.closest("button[data-window-button]") !== null
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        WM.windows.focus(this.windowId);

        element.setPointerCapture(event.pointerId);
        pointerId = event.pointerId;

        Object.assign(this.move, {
          active: true,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: this.bounds.x,
          startTop: this.bounds.y,
          width: this.bounds.width,
          height: this.bounds.height,
          container: WM.container.getBounds(),
          dx: 0,
          dy: 0,
        });

        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerup", onEnd);
        element.addEventListener("pointercancel", onEnd);
      };

      element.addEventListener("pointerdown", onDown);
      return cleanup;
    };
  }
}
