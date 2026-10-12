import kernel, {
  WindowFlag,
  type SnapZone,
  type WindowId,
  type WindowInstance,
  type DesktopWindowsService,
} from "$lib/core/api";
import type { Bounds } from "$lib/core/utils/type";
import type { Attachment } from "svelte/attachments";

// TODO: cleanup logic
const windows = $derived(kernel.service<DesktopWindowsService>("windows"));

const DRAG_THRESHOLD = 4;

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
    const CORNER_SIZE = 200; // how far along an edge the corner zone reaches

    const x = cx - container.x;
    const y = cy - container.y;

    const left_edge = x <= EDGE_THRESHOLD;
    const right_edge = x >= container.width - EDGE_THRESHOLD;
    const top_edge = y <= EDGE_THRESHOLD;
    const bottom_edge = y >= container.height - EDGE_THRESHOLD;

    const near_left = x <= CORNER_SIZE;
    const near_right = x >= container.width - CORNER_SIZE;
    const near_top = y <= CORNER_SIZE;
    const near_bottom = y >= container.height - CORNER_SIZE;

    if ((left_edge && near_top) || (top_edge && near_left)) return "top-left";
    if ((right_edge && near_top) || (top_edge && near_right)) return "top-right";
    if ((left_edge && near_bottom) || (bottom_edge && near_left)) return "bottom-left";
    if ((right_edge && near_bottom) || (bottom_edge && near_right)) return "bottom-right";

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

  private clamp_width(width: number): number {
    const { min = WindowGeometryHandler.MIN_WIDTH, max = Infinity } = this.instance.constraints.width ?? {};
    return Math.max(min, Math.min(max, width));
  }

  private clamp_height(height: number): number {
    const { min = WindowGeometryHandler.MIN_HEIGHT, max = Infinity } = this.instance.constraints.height ?? {};
    return Math.max(min, Math.min(max, height));
  }

  public resize_attachment(edge: ResizeEdge) {
    return this.create_move_attachment("resize", (event) => {
      if (edge.includes("e")) {
        const { width: cw } = this.move.container;
        const { client_x: sx, left: sl } = this.move.start;

        const dx = event.clientX - sx;
        const width = this.instance.bounds.width + dx;
        const max_width = cw - sl;
        this.move.width = this.clamp_width(Math.round(Math.min(max_width, width)));
      }

      if (edge.includes("w")) {
        const { client_x: sx, left: sl } = this.move.start;

        const dx = Math.max(-sl, event.clientX - sx);
        this.move.width = this.clamp_width(Math.round(this.instance.bounds.width - dx));
        this.move.dx = this.instance.bounds.width - this.move.width;
      }

      if (edge.includes("s")) {
        const { height: ch } = this.move.container;
        const { client_y: sy, top: st } = this.move.start;

        const dy = event.clientY - sy;
        const height = this.instance.bounds.height + dy;
        const max_height = ch - st;

        this.move.height = this.clamp_height(Math.round(Math.min(max_height, height)));
      }

      if (edge.includes("n")) {
        const { client_y: sy, top: st } = this.move.start;

        const dy = Math.max(-st, event.clientY - sy);
        this.move.height = this.clamp_height(Math.round(this.instance.bounds.height - dy));
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
      let down_event: PointerEvent | null = null;
      let pending_event: PointerEvent | null = null;

      const cleanup = () => {
        element.removeEventListener("pointerdown", on_down);
        element.removeEventListener("pointermove", on_move);
        element.removeEventListener("lostpointercapture", on_end);

        if (pointer_id !== null && element.hasPointerCapture(pointer_id)) {
          element.releasePointerCapture(pointer_id);
        }
      };

      const on_move = (event: PointerEvent) => {
        event.preventDefault();

        // A click without movement must not unsnap or restore the window, so nothing starts until the pointer travels.
        if (!this.move.active) {
          if (!down_event) return;
          const distance = Math.hypot(event.clientX - down_event.clientX, event.clientY - down_event.clientY);
          if (distance < DRAG_THRESHOLD) return;
          this.init_move(type, element, down_event);
        }

        pending_event = event;
        cancelAnimationFrame(this.move.animation_frame);
        this.move.animation_frame = requestAnimationFrame(() => {
          pending_event = null;
          handle_move(event);
        });
      };

      // lostpointercapture fires for every way a gesture can end (pointerup, pointercancel, element removed).
      const on_end = () => {
        element.removeEventListener("pointermove", on_move);
        element.removeEventListener("lostpointercapture", on_end);

        cancelAnimationFrame(this.move.animation_frame);

        if (this.move.active) {
          if (pending_event) handle_move(pending_event);
          this.apply_move(element);
        }

        pointer_id = null;
        down_event = null;
        pending_event = null;
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
        down_event = event;

        element.addEventListener("pointermove", on_move);
        element.addEventListener("lostpointercapture", on_end);
      };

      element.addEventListener("pointerdown", on_down);
      return cleanup;
    };
  }

  private init_move(type: "drag" | "resize", element: HTMLDivElement, event: PointerEvent) {
    const container = windows.container.bounds;

    if (this.instance.snap_zone || this.instance.flags.has(WindowFlag.MAXIMIZED)) {
      const rect = element.parentElement!.getBoundingClientRect();
      // Window bounds are relative to the container; the rect is relative to the viewport.
      const bounds: Bounds = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.left - container.x),
        y: Math.round(rect.top - container.y),
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
          container,
        });
      } else {
        // Keep the grab point at the same relative spot of the restored, narrower window.
        const grab_offset = ((event.clientX - rect.left) / rect.width) * this.instance.bounds.width;

        Object.assign(this.move, {
          active: true,
          width: this.instance.bounds.width,
          height: this.instance.bounds.height,
          dx: 0,
          dy: 0,
          start: {
            client_x: event.clientX,
            client_y: event.clientY,
            left: Math.round(event.clientX - container.x - grab_offset),
            top: bounds.y,
          },
          container,
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
        container,
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
