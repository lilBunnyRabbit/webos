import { WM } from "$lib/core/stores";
import type { Bounds, SnapZone, WindowId, WindowInstance } from "$lib/core/stores/window-manager/window-manager.type";
import type { Attachment } from "svelte/attachments";

// TODO: cleanup logic

export const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type ResizeEdge = (typeof RESIZE_EDGES)[number];

interface MovingState {
  active: boolean;
  width: number;
  height: number;
  dx: number;
  dy: number;
  start: {
    clientX: number;
    clientY: number;
    left: number;
    top: number;
  };
  container: Bounds;
  animationFrame: number;
}

export class WindowGeometryHandler {
  public move = $state<MovingState>({
    active: false,
    width: 0,
    height: 0,
    dx: 0,
    dy: 0,
    start: {
      clientX: 0,
      clientY: 0,
      left: 0,
      top: 0,
    },
    container: {
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    },
    animationFrame: 0,
  });

  public snapZone = $state<SnapZone | null>(null);

  private instance: WindowInstance;

  constructor(private windowId: WindowId) {
    this.instance = $derived(WM.windows.get(this.windowId)!);
  }

  public static getSnapPosition(snapZone: SnapZone): Record<"left" | "top" | "width" | "height", string> {
    const SNAP_PADDING = 8;

    switch (snapZone) {
      case "top":
        return {
          left: `${SNAP_PADDING}px`,
          top: `${SNAP_PADDING}px`,
          width: `calc(100% - ${2 * SNAP_PADDING}px)`,
          height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        };

      case "bottom":
        return {
          left: `${SNAP_PADDING}px`,
          top: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
          width: `calc(100% - ${2 * SNAP_PADDING}px)`,
          height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        };

      case "left":
        return {
          left: `${SNAP_PADDING}px`,
          top: `${SNAP_PADDING}px`,
          width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
          height: `calc(100% - ${2 * SNAP_PADDING}px)`,
        };

      case "right":
        return {
          left: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
          top: `${SNAP_PADDING}px`,
          width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
          height: `calc(100% - ${2 * SNAP_PADDING}px)`,
        };

      case "top-left":
        return {
          left: `${SNAP_PADDING}px`,
          top: `${SNAP_PADDING}px`,
          width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
          height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        };

      case "top-right":
        return {
          left: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
          top: `${SNAP_PADDING}px`,
          width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
          height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        };

      case "bottom-left":
        return {
          left: `${SNAP_PADDING}px`,
          top: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
          width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
          height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        };

      case "bottom-right":
        return {
          left: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
          top: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
          width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
          height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        };

      default:
        return {
          left: `${SNAP_PADDING}px`,
          top: `${SNAP_PADDING}px`,
          width: `calc(100% - ${2 * SNAP_PADDING}px)`,
          height: `calc(100% - ${2 * SNAP_PADDING}px)`,
        };
    }
  }

  private getSnapZone(cx: number, cy: number): SnapZone | null {
    if (!this.move.active) return null;

    const container = this.move.container;

    const EDGE_THRESHOLD = 16; // pixels from edge to trigger snap
    const CORNER_SIZE = 200; // size of corner zones

    const x = cx - container.x;
    const y = cy - container.y;

    // Check edges
    const isAtLeftEdge = x <= EDGE_THRESHOLD;
    const isAtRightEdge = x >= container.width - EDGE_THRESHOLD;
    const isAtTopEdge = y <= EDGE_THRESHOLD;
    const isAtBottomEdge = y >= container.height - EDGE_THRESHOLD;

    // Check corners (smaller regions at the intersections)
    if (isAtLeftEdge && isAtTopEdge && x <= CORNER_SIZE && y <= CORNER_SIZE) {
      return "top-left";
    }
    if (isAtRightEdge && isAtTopEdge && x >= container.width - CORNER_SIZE && y <= CORNER_SIZE) {
      return "top-right";
    }
    if (isAtLeftEdge && isAtBottomEdge && x <= CORNER_SIZE && y >= container.height - CORNER_SIZE) {
      return "bottom-left";
    }
    if (isAtRightEdge && isAtBottomEdge && x >= container.width - CORNER_SIZE && y >= container.height - CORNER_SIZE) {
      return "bottom-right";
    }

    // Check edges (full height/width)
    if (isAtLeftEdge) return "left";
    if (isAtRightEdge) return "right";
    if (isAtTopEdge) return "top";
    if (isAtBottomEdge) return "bottom";
    return null;
  }

  public dragAttachment() {
    return this.createMoveAttachment("drag", (event) => {
      const { x: cx, y: cy, width: cw, height: ch } = this.move.container;
      const { clientX: sx, clientY: sy, top: st } = this.move.start;

      this.snapZone = this.getSnapZone(event.clientX, event.clientY);

      // optimized calculations (extracted sx and sy)
      this.move.dx = Math.round(Math.max(cx, Math.min(cw + cx, event.clientX)) - sx);
      this.move.dy = Math.round(Math.max(-st, Math.min(ch + cy, event.clientY) - sy));
    });
  }

  public resizeAttachment(edge: ResizeEdge) {
    return this.createMoveAttachment("resize", (event) => {
      if (edge.includes("e")) {
        const { width: cw } = this.move.container;
        const { clientX: sx, left: sl } = this.move.start;

        const dx = event.clientX - sx;
        const width = this.instance.bounds.width + dx;
        const maxWidth = cw - sl;

        this.move.width = Math.max(this.instance.defaults.minWidth, Math.round(Math.min(maxWidth, width)));
      }

      if (edge.includes("w")) {
        const { clientX: sx, left: sl } = this.move.start;

        const dx = Math.max(-sl, event.clientX - sx);
        this.move.width = Math.max(this.instance.defaults.minWidth, Math.round(this.instance.bounds.width - dx));
        this.move.dx = this.instance.bounds.width - this.move.width;
      }

      if (edge.includes("s")) {
        const { height: ch } = this.move.container;
        const { clientY: sy, top: st } = this.move.start;

        const dy = event.clientY - sy;
        const height = this.instance.bounds.height + dy;
        const maxHeight = ch - st;

        this.move.height = Math.max(this.instance.defaults.minHeight, Math.round(Math.min(maxHeight, height)));
      }

      if (edge.includes("n")) {
        const { clientY: sy, top: st } = this.move.start;

        const dy = Math.max(-st, event.clientY - sy);
        this.move.height = Math.max(this.instance.defaults.minHeight, Math.round(this.instance.bounds.height - dy));
        this.move.dy = this.instance.bounds.height - this.move.height;
      }
    });
  }

  private createMoveAttachment(
    type: "drag" | "resize",
    handleMove: (event: PointerEvent) => void
  ): Attachment<HTMLDivElement> {
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

        this.applyMove(element);

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

        this.initMove(type, element, event);

        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerup", onEnd);
        element.addEventListener("pointercancel", onEnd);
      };

      element.addEventListener("pointerdown", onDown);
      return cleanup;
    };
  }

  private initMove(type: "drag" | "resize", element: HTMLDivElement, event: PointerEvent) {
    if (this.instance.snapZone || this.instance.flags.has(WM.WindowFlag.MAXIMIZED)) {
      const rect = element.parentElement!.getBoundingClientRect();
      const bounds: Bounds = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      };

      if (type === "resize") {
        this.instance.bounds = {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
        };

        Object.assign(this.move, {
          active: true,
          width: this.instance.bounds.width,
          height: this.instance.bounds.height,
          dx: 0,
          dy: 0,
          start: {
            clientX: event.clientX,
            clientY: event.clientY,
            left: this.instance.bounds.x,
            top: this.instance.bounds.y,
          },
          container: WM.container.getBounds(),
        });
      } else {
        const sx = (event.clientX / bounds.width) * this.instance.bounds.width;

        Object.assign(this.move, {
          active: true,
          width: this.instance.bounds.width,
          height: this.instance.bounds.height,
          dx: Math.round(event.clientX - sx),
          dy: 0,
          start: {
            clientX: sx,
            clientY: event.clientY,
            left: bounds.x,
            top: bounds.y,
          },
          container: WM.container.getBounds(),
        });
      }
    } else {
      Object.assign(this.move, {
        active: true,
        width: this.instance.bounds.width,
        height: this.instance.bounds.height,
        dx: 0,
        dy: 0,
        start: {
          clientX: event.clientX,
          clientY: event.clientY,
          left: this.instance.bounds.x,
          top: this.instance.bounds.y,
        },
        container: WM.container.getBounds(),
      });
    }
  }

  private applyMove(element: HTMLDivElement) {
    if (this.snapZone) {
      const parent = element.parentElement!;
      if (parent) {
        parent.style.transition = "all 0.25s cubic-bezier(0.4,0,0.2,1)";
      }

      this.instance.snapZone = this.snapZone;

      if (parent) {
        const cleanup = () => {
          parent.style.transition = "";
          parent.removeEventListener("transitionend", cleanup);
        };

        parent.addEventListener("transitionend", cleanup);
      }
    } else {
      this.instance.bounds.width = this.move.width;
      this.instance.bounds.height = this.move.height;
      this.instance.bounds.x = this.move.start.left + this.move.dx;
      this.instance.bounds.y = this.move.start.top + this.move.dy;

      this.instance.snapZone = null;
    }
    this.instance.flags.delete(WM.WindowFlag.MAXIMIZED);
    Object.assign(this.move, {
      active: false,
      width: 0,
      height: 0,
      dx: 0,
      dy: 0,
      start: {
        clientX: 0,
        clientY: 0,
        left: 0,
        top: 0,
      },
      container: {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      },
      animationFrame: 0,
    });
    this.snapZone = null;
  }
}
