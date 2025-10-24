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

interface ResizeState {
  active: boolean;
  edge: ResizeEdge | null;
  startX: number;
  startY: number;
  width: number;
  height: number;
  startLeft: number;
  startTop: number;
  dx: number;
  dy: number;
  animationFrame: number;
}

export class WindowGeometryHandler {
  public drag = $state<DragState>({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    dx: 0,
    dy: 0,
    animationFrame: 0,
  });

  private resetDrag() {
    Object.assign(this.drag, {
      active: false,
      startX: 0,
      startY: 0,
      startLeft: 0,
      startTop: 0,
      dx: 0,
      dy: 0,
      animationFrame: 0,
    });
  }

  public resize = $state<ResizeState>({
    active: false,
    edge: null,
    startX: 0,
    startY: 0,
    width: 0,
    height: 0,
    startLeft: 0,
    startTop: 0,
    dx: 0,
    dy: 0,
    animationFrame: 0,
  });

  private resetResize() {
    Object.assign(this.resize, {
      active: false,
      edge: null,
      startX: 0,
      startY: 0,
      width: 0,
      height: 0,
      startLeft: 0,
      startTop: 0,
      dx: 0,
      dy: 0,
      animationFrame: 0,
    });
  }

  private bounds: Bounds;
  private minW = 240;
  private minH = 140;

  constructor(private windowId: WindowId) {
    this.bounds = $derived(WM.windows.get(this.windowId)!.bounds);
  }

  public createMoveAttachment() {
    return this.createAttachment({
      disabled: (element, event) => {
        if (element === event.target) {
          return false;
        }

        console.log(event.target, event.target instanceof HTMLButtonElement && !event.target.dataset.windowButton);

        return event.target instanceof HTMLButtonElement && !event.target.dataset.windowButton;
      },
      onStart: (event) => {
        Object.assign(this.drag, {
          active: true,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: this.bounds.x,
          startTop: this.bounds.y,
          dx: 0,
          dy: 0,
        });
      },
      onMove: (event) => {
        const ndx = event.clientX - this.drag.startX;
        const ndy = event.clientY - this.drag.startY;

        cancelAnimationFrame(this.drag.animationFrame);
        this.drag.animationFrame = requestAnimationFrame(() => {
          this.drag.dx = Math.round(ndx);
          this.drag.dy = Math.round(ndy);
        });
      },
      onEnd: () => {
        cancelAnimationFrame(this.drag.animationFrame);

        this.bounds.x = this.drag.startLeft + this.drag.dx;
        this.bounds.y = this.drag.startTop + this.drag.dy;

        this.resetDrag();
      },
    });
  }

  public createResizeAttachment(edge: ResizeEdge) {
    return this.createAttachment({
      onStart: (event) => {
        const x = event.clientX;
        const y = event.clientY;

        Object.assign(this.resize, {
          active: true,
          edge,
          startX: x,
          startY: y,
          width: this.bounds.width,
          height: this.bounds.height,
          startLeft: this.bounds.x,
          startTop: this.bounds.y,
          dx: 0,
          dy: 0,
        });
      },
      onMove: (event) => {
        const x = event.clientX;
        const y = event.clientY;

        cancelAnimationFrame(this.resize.animationFrame);
        this.resize.animationFrame = requestAnimationFrame(() => {
          const dx = x - this.resize.startX;
          const dy = y - this.resize.startY;

          if (edge.includes("e")) {
            this.resize.width = Math.max(this.minW, Math.round(this.bounds.width + dx));
          }

          if (edge.includes("w")) {
            this.resize.width = Math.max(this.minW, Math.round(this.bounds.width - dx));
            this.resize.dx = this.bounds.width - this.resize.width;
          }

          if (edge.includes("s")) {
            this.resize.height = Math.max(this.minH, Math.round(this.bounds.height + dy));
          }

          if (edge.includes("n")) {
            this.resize.height = Math.max(this.minH, Math.round(this.bounds.height - dy));
            this.resize.dy = this.bounds.height - this.resize.height;
          }
        });
      },
      onEnd: () => {
        cancelAnimationFrame(this.resize.animationFrame);

        this.bounds.width = this.resize.width;
        this.bounds.height = this.resize.height;
        this.bounds.x = this.resize.startLeft + this.resize.dx;
        this.bounds.y = this.resize.startTop + this.resize.dy;

        this.resetResize();
      },
    });
  }

  private createAttachment(handlers: {
    disabled?: (element: HTMLDivElement, event: PointerEvent) => boolean;
    onStart: (event: PointerEvent) => void;
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
  }): Attachment<HTMLDivElement> {
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

      const onMove = (e: PointerEvent) => {
        e.preventDefault();
        handlers.onMove(e);
      };

      const onEnd = (e: PointerEvent) => {
        e.preventDefault();

        element.releasePointerCapture(e.pointerId);

        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onEnd);
        element.removeEventListener("pointercancel", onEnd);

        handlers.onEnd(e);
        pointerId = null;
      };

      const onDown = (e: PointerEvent) => {
        if (handlers.disabled && handlers.disabled(element, e)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        WM.windows.focus(this.windowId);

        element.setPointerCapture(e.pointerId);
        pointerId = e.pointerId;

        handlers.onStart(e);

        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerup", onEnd);
        element.addEventListener("pointercancel", onEnd);
      };

      element.addEventListener("pointerdown", onDown);
      return cleanup;
    };
  }
}
