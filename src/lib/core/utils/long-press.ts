import type { Attachment } from "svelte/attachments";
import type { Position } from "$lib/core/utils/type";

/** Long enough not to fire on a slow tap, short enough to feel like the platform's own long press. */
export const HOLD_MS = 450;
/**
 * Movement before the hold fires is a scroll or swipe, handed to the browser. A still finger on Samsung Internet drifts
 * past 8px within the hold, so this matches Chrome's own tap slop (15px) instead.
 */
export const SLOP_PX = 16;

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
    /** The last touch press, kept past a browser cancel so a late `contextmenu` can still open the menu. */
    let pressed: Position | null = null;

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
      if (event.pointerType === "mouse" || !event.isPrimary || ignored(event)) return;
      reset();
      start = point(event);
      pressed = start;
      pointer_id = event.pointerId;
      timer = setTimeout(hold, HOLD_MS);
    }

    function hold() {
      clearTimeout(timer);
      timer = undefined;
      held = true;
      swallow_click = true;
      navigator.vibrate?.(8);
      // From here the element keeps the pointer even when the finger leaves it.
      if (pointer_id !== null && element.isConnected) {
        try {
          element.setPointerCapture(pointer_id);
        } catch (error) {
          // The pointer ended without an event reaching us: nothing to hold on to.
          reset();
        }
      }
    }

    function on_pointer_move(event: PointerEvent) {
      if (event.pointerId !== pointer_id || !start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX;

      if (!held) {
        if (moved) {
          pressed = null;
          reset();
        }
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
      if (event.pointerType !== "mouse") pressed = null;
      if (event.pointerId !== pointer_id) return;
      if (dragging) options.on_drag_end?.(point(event));
      else if (held) options.on_menu(point(event));
      reset();
    }

    function on_pointer_cancel(event: PointerEvent) {
      if (event.pointerId !== pointer_id) return;
      if (dragging) options.on_drag_cancel?.();
      reset();
    }

    // Must be non-passive: it's the only way to stop the browser scrolling under a held finger.
    function on_touch_move(event: TouchEvent) {
      if (held && event.cancelable) event.preventDefault();
    }

    function on_click(event: MouseEvent) {
      if (!swallow_click) return;
      swallow_click = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function on_context_menu(event: MouseEvent) {
      // Android fires contextmenu for a touch long press too; the timer already handles that one.
      event.preventDefault();
      if (ignored(event)) return;
      const type = (event as Partial<PointerEvent>).pointerType;
      const at = { x: event.clientX, y: event.clientY };
      if (type !== "touch" && type !== "pen") {
        if (start === null) options.on_menu(at);
        return;
      }
      // Samsung Internet's own long press beats the timer on elements with text: it either arrives first (hold now) or
      // after the browser already cancelled the pointer (open the menu, since the finger is still down and still).
      if (timer !== undefined) hold();
      else if (start === null && pressed !== null) {
        pressed = null;
        options.on_menu(at);
      }
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
