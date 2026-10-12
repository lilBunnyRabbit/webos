import type { Attachment } from "svelte/attachments";
import type { Position } from "$lib/core/utils/type";

/** Long enough not to fire on a slow tap, short enough to feel like the platform's own long press. */
const HOLD_MS = 450;
/**
 * Movement before the hold fires is a scroll or swipe, handed to the browser. A still finger on Samsung Internet drifts
 * past 8px within the hold, so this matches Chrome's own tap slop (15px) instead.
 */
const SLOP_PX = 16;

// Temporary (2026-10-12): `?debug-touch` prints the events a long press sees, to diagnose drags failing on a real phone.
const DEBUG = new URLSearchParams(location.search).has("debug-touch");
let debug_lines: string[] = [];
function debug(line: string) {
  if (!DEBUG) return;
  let panel = document.getElementById("debug-touch");
  if (!panel) {
    panel = document.createElement("pre");
    panel.id = "debug-touch";
    panel.style.cssText =
      "position:fixed;left:4px;right:4px;top:4px;z-index:100000;max-height:45vh;overflow:auto;margin:0;padding:6px;font:11px/1.3 monospace;background:rgb(0 0 0/.85);color:#fff;pointer-events:none;white-space:pre-wrap";
    document.body.append(panel);
  }
  const stamp = `${(performance.now() / 1000).toFixed(2)} `;
  const kind = line.split(" ")[0];
  const last = debug_lines.at(-1);
  // Collapse runs of the same event so one gesture fits on screen; newest first since the panel can't be scrolled.
  if (last?.split(" ")[1] === kind && (kind === "move" || kind === "touchmove")) {
    const count = Number(last.match(/ x(\d+)$/)?.[1] ?? 1) + 1;
    debug_lines = [...debug_lines.slice(0, -1), `${stamp}${line} x${count}`];
  } else {
    debug_lines = [...debug_lines.slice(-30), `${stamp}${line}`];
  }
  panel.textContent = `${navigator.userAgent}\n${[...debug_lines].reverse().join("\n")}`;
}

export interface LongPressOptions {
  /** Hold without moving, then release. Also a mouse right-click. */
  on_menu: (point: Position) => void;
  /** Hold, then move: the element is being dragged. Without it, moving after the hold just cancels. */
  on_drag_start?: (point: Position) => void;
  on_drag_move?: (point: Position) => void;
  on_drag_end?: (point: Position) => void;
  on_drag_cancel?: () => void;
  /** Presses starting inside an element matching this selector belong to that element's own long press. */
  ignore?: string;
}

/**
 * Touch long press for the mobile shell (ADR-016). Before the hold fires, the browser owns the gesture, so page swipes
 * and scrolling stay native. Once it fires, the element owns it: `touchmove` is cancelled so the finger drags instead of
 * scrolling, and the click that follows the release is swallowed.
 */
export function long_press(options: LongPressOptions): Attachment<HTMLElement> {
  return (element) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: Position | null = null;
    let held = false;
    let dragging = false;
    let pointer_id: number | null = null;
    let swallow_click = false;

    const point = (event: PointerEvent): Position => ({ x: event.clientX, y: event.clientY });

    function reset() {
      clearTimeout(timer);
      timer = undefined;
      start = null;
      held = false;
      dragging = false;
      pointer_id = null;
    }

    const ignored = (event: Event) => !!options.ignore && !!(event.target as Element).closest?.(options.ignore);

    function on_pointer_down(event: PointerEvent) {
      if (event.pointerType !== "mouse") debug_lines = [];
      debug(`down ${event.pointerType} id=${event.pointerId} primary=${event.isPrimary} ta=${getComputedStyle(element).touchAction}`);
      if (event.pointerType === "mouse" || !event.isPrimary || ignored(event)) return;
      reset();
      start = point(event);
      pointer_id = event.pointerId;
      timer = setTimeout(() => {
        debug("hold");
        held = true;
        swallow_click = true;
        navigator.vibrate?.(8);
        // From here the element keeps the pointer even when the finger leaves it.
        if (pointer_id !== null && element.isConnected) {
          try {
            element.setPointerCapture(pointer_id);
          } catch (error) {
            debug(`capture failed ${error}`);
            // The pointer ended without an event reaching us: nothing to hold on to.
            reset();
          }
        }
      }, HOLD_MS);
    }

    function on_pointer_move(event: PointerEvent) {
      if (start)
        debug(
          `move held=${held} dragging=${dragging} dist=${Math.round(Math.hypot(event.clientX - start.x, event.clientY - start.y))}`
        );
      if (event.pointerId !== pointer_id || !start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX;

      if (!held) {
        if (moved) reset();
        return;
      }
      if (!dragging && moved) {
        if (!options.on_drag_start) return reset();
        dragging = true;
        options.on_drag_start(start);
      }
      if (dragging) options.on_drag_move?.(point(event));
    }

    function on_pointer_up(event: PointerEvent) {
      if (start) debug(`up id=${event.pointerId} held=${held} dragging=${dragging}`);
      if (event.pointerId !== pointer_id) return;
      if (dragging) options.on_drag_end?.(point(event));
      else if (held) options.on_menu(point(event));
      reset();
    }

    function on_pointer_cancel(event: PointerEvent) {
      if (start) debug(`CANCEL id=${event.pointerId} held=${held}`);
      if (event.pointerId !== pointer_id) return;
      if (dragging) options.on_drag_cancel?.();
      reset();
    }

    // Must be non-passive: it's the only way to stop the browser scrolling under a held finger.
    function on_touch_move(event: TouchEvent) {
      if (start) debug(`touchmove cancelable=${event.cancelable} held=${held}`);
      if (held && event.cancelable) event.preventDefault();
    }

    function on_click(event: MouseEvent) {
      if (!swallow_click) return;
      swallow_click = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function on_context_menu(event: MouseEvent) {
      debug(`contextmenu ${(event as Partial<PointerEvent>).pointerType ?? "?"} held=${held}`);
      // Android fires contextmenu for a touch long press too; the timer already handles that one.
      event.preventDefault();
      if (ignored(event)) return;
      const type = (event as Partial<PointerEvent>).pointerType;
      if (type !== "touch" && type !== "pen" && start === null) options.on_menu({ x: event.clientX, y: event.clientY });
    }

    element.addEventListener("pointerdown", on_pointer_down);
    element.addEventListener("pointermove", on_pointer_move);
    element.addEventListener("pointerup", on_pointer_up);
    element.addEventListener("pointercancel", on_pointer_cancel);
    element.addEventListener("touchmove", on_touch_move, { passive: false });
    element.addEventListener("click", on_click, { capture: true });
    element.addEventListener("contextmenu", on_context_menu);

    return () => {
      reset();
      element.removeEventListener("pointerdown", on_pointer_down);
      element.removeEventListener("pointermove", on_pointer_move);
      element.removeEventListener("pointerup", on_pointer_up);
      element.removeEventListener("pointercancel", on_pointer_cancel);
      element.removeEventListener("touchmove", on_touch_move);
      element.removeEventListener("click", on_click, { capture: true });
      element.removeEventListener("contextmenu", on_context_menu);
    };
  };
}
