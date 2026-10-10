import kernel, {
  WindowFlag,
  type SnapZone,
  type WindowId,
  type WindowInstance,
  type WindowsService,
} from "$lib/core/api";
import type { Bounds } from "$lib/core/utils/type";
import type { Attachment } from "svelte/attachments";

// TODO: cleanup logic
const windows = $derived(kernel.service<WindowsService>("windows"));

export const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type ResizeEdge = (typeof RESIZE_EDGES)[number];

interface MovingState {
  active: boolean;
  width: number;
  height: number;
  dx: number;
  dy: number;
  start: {
    client_x: number;
    client_y: number;
    left: number;
    top: number;
  };
  container: Bounds;
  animation_frame: number;
}

export class WindowGeometryHandler {
  // TODO: do I want defaults? or required constraints?
  static MIN_WIDTH = 400;
  static MIN_HEIGHT = 300;

  public move = $state<MovingState>({
    active: false,
    width: 0,
    height: 0,
    dx: 0,
    dy: 0,
    start: {
      client_x: 0,
      client_y: 0,
      left: 0,
      top: 0,
    },
    container: {
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    },
    animation_frame: 0,
  });

  public snap_zone = $state<SnapZone | null>(null);

  private instance: WindowInstance;

  constructor(private id: WindowId) {
    this.instance = $derived(windows.get(this.id)!);
  }

  public static get_snap_position(snap_zone: SnapZone): Record<"left" | "top" | "width" | "height", string> {
    const SNAP_PADDING = 8;

    switch (snap_zone) {
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

  private get_snap_zone(cx: number, cy: number): SnapZone | null {
    if (!this.move.active) return null;

    const container = this.move.container;

    const EDGE_THRESHOLD = 16; // pixels from edge to trigger snap
    const CORNER_SIZE = 200; // size of corner zones

    const x = cx - container.x;
    const y = cy - container.y;

    // Check edges
    const left_edge = x <= EDGE_THRESHOLD;
    const right_edge = x >= container.width - EDGE_THRESHOLD;
    const top_edge = y <= EDGE_THRESHOLD;
    const bottom_edge = y >= container.height - EDGE_THRESHOLD;

    // Check corners (smaller regions at the intersections)
    if (left_edge && top_edge && x <= CORNER_SIZE && y <= CORNER_SIZE) {
      return "top-left";
    }
    if (right_edge && top_edge && x >= container.width - CORNER_SIZE && y <= CORNER_SIZE) {
      return "top-right";
    }
    if (left_edge && bottom_edge && x <= CORNER_SIZE && y >= container.height - CORNER_SIZE) {
      return "bottom-left";
    }
    if (right_edge && bottom_edge && x >= container.width - CORNER_SIZE && y >= container.height - CORNER_SIZE) {
      return "bottom-right";
    }

    // Check edges (full height/width)
    if (left_edge) return "left";
    if (right_edge) return "right";
    if (top_edge) return "top";
    if (bottom_edge) return "bottom";
    return null;
  }

  public drag_attachment() {
    return this.create_move_attachment("drag", (event) => {
      const { x: cx, y: cy, width: cw, height: ch } = this.move.container;
      const { client_x: sx, client_y: sy, top: st } = this.move.start;

      this.snap_zone = this.get_snap_zone(event.clientX, event.clientY);

      // optimized calculations (extracted sx and sy)
      this.move.dx = Math.round(Math.max(cx, Math.min(cw + cx, event.clientX)) - sx);
      this.move.dy = Math.round(Math.max(-st, Math.min(ch + cy, event.clientY) - sy));
    });
  }

  public resize_attachment(edge: ResizeEdge) {
    return this.create_move_attachment("resize", (event) => {
      if (edge.includes("e")) {
        const { width: cw } = this.move.container;
        const { client_x: sx, left: sl } = this.move.start;

        const dx = event.clientX - sx;
        const width = this.instance.bounds.width + dx;
        const max_width = cw - sl;
        const new_width = Math.round(Math.min(max_width, width));

        this.move.width = Math.max(this.instance.constraints.width?.min ?? WindowGeometryHandler.MIN_WIDTH, new_width);
      }

      if (edge.includes("w")) {
        const { client_x: sx, left: sl } = this.move.start;

        const dx = Math.max(-sl, event.clientX - sx);
        this.move.width = Math.max(
          this.instance.constraints.width?.min ?? WindowGeometryHandler.MIN_WIDTH,
          Math.round(this.instance.bounds.width - dx)
        );
        this.move.dx = this.instance.bounds.width - this.move.width;
      }

      if (edge.includes("s")) {
        const { height: ch } = this.move.container;
        const { client_y: sy, top: st } = this.move.start;

        const dy = event.clientY - sy;
        const height = this.instance.bounds.height + dy;
        const max_height = ch - st;

        this.move.height = Math.max(
          this.instance.constraints.height?.min ?? WindowGeometryHandler.MIN_HEIGHT,
          Math.round(Math.min(max_height, height))
        );
      }

      if (edge.includes("n")) {
        const { client_y: sy, top: st } = this.move.start;

        const dy = Math.max(-st, event.clientY - sy);
        this.move.height = Math.max(
          this.instance.constraints.height?.min ?? WindowGeometryHandler.MIN_HEIGHT,
          Math.round(this.instance.bounds.height - dy)
        );
        this.move.dy = this.instance.bounds.height - this.move.height;
      }
    });
  }

  private create_move_attachment(
    type: "drag" | "resize",
    handle_move: (event: PointerEvent) => void
  ): Attachment<HTMLDivElement> {
    return (element) => {
      let pointer_id: number | null = null;

      const cleanup = () => {
        element.removeEventListener("pointerdown", on_down);
        element.removeEventListener("pointermove", on_move);
        element.removeEventListener("pointerup", on_end);
        element.removeEventListener("pointercancel", on_end);

        if (pointer_id !== null && element.hasPointerCapture(pointer_id)) {
          element.releasePointerCapture(pointer_id);
        }
      };

      const on_move = (event: PointerEvent) => {
        event.preventDefault();

        cancelAnimationFrame(this.move.animation_frame);
        this.move.animation_frame = requestAnimationFrame(() => {
          handle_move(event);
        });
      };

      const on_end = (event: PointerEvent) => {
        event.preventDefault();

        element.releasePointerCapture(event.pointerId);

        element.removeEventListener("pointermove", on_move);
        element.removeEventListener("pointerup", on_end);
        element.removeEventListener("pointercancel", on_end);

        cancelAnimationFrame(this.move.animation_frame);

        this.apply_move(element);

        pointer_id = null;
      };

      const on_down = (event: PointerEvent) => {
        if (
          element !== event.target &&
          event.target instanceof Element &&
          event.target.closest("button[data-window-button]") !== null
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        windows.focus(this.id);

        element.setPointerCapture(event.pointerId);
        pointer_id = event.pointerId;

        this.init_move(type, element, event);

        element.addEventListener("pointermove", on_move);
        element.addEventListener("pointerup", on_end);
        element.addEventListener("pointercancel", on_end);
      };

      element.addEventListener("pointerdown", on_down);
      return cleanup;
    };
  }

  private init_move(type: "drag" | "resize", element: HTMLDivElement, event: PointerEvent) {
    if (this.instance.snap_zone || this.instance.flags.has(WindowFlag.MAXIMIZED)) {
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
            client_x: event.clientX,
            client_y: event.clientY,
            left: this.instance.bounds.x,
            top: this.instance.bounds.y,
          },
          container: windows.container.bounds,
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
            client_x: sx,
            client_y: event.clientY,
            left: bounds.x,
            top: bounds.y,
          },
          container: windows.container.bounds,
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
          client_x: event.clientX,
          client_y: event.clientY,
          left: this.instance.bounds.x,
          top: this.instance.bounds.y,
        },
        container: windows.container.bounds,
      });
    }
  }

  private apply_move(element: HTMLDivElement) {
    if (this.snap_zone) {
      const parent = element.parentElement!;
      if (parent) {
        parent.style.transition = "all 0.25s cubic-bezier(0.4,0,0.2,1)";
      }

      this.instance.snap_zone = this.snap_zone;

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

      this.instance.snap_zone = null;
    }
    this.instance.flags.delete(WindowFlag.MAXIMIZED);
    Object.assign(this.move, {
      active: false,
      width: 0,
      height: 0,
      dx: 0,
      dy: 0,
      start: {
        client_x: 0,
        client_y: 0,
        left: 0,
        top: 0,
      },
      container: {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      },
      animation_frame: 0,
    });
    this.snap_zone = null;
  }
}
