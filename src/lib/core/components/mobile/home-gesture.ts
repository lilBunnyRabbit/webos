import type { Attachment } from "svelte/attachments";
import type { Position } from "$lib/core/utils/type";
import { SLOP_PX } from "$lib/core/utils/long-press";

const ITEM = "[data-home-name]";
const IGNORE = "[data-home-control], input, textarea, select, [contenteditable]";

export interface HomeGestureOptions {
  /** Read on every press: edit mode picks an item up sooner than the hold that enters it. */
  hold_ms: () => number;
  /** A mouse press that moves drags the item (edit mode); a mouse never holds. */
  mouse_drags: () => boolean;
  on_pick: (name: string, point: Position) => void;
  on_move: (point: Position) => void;
  on_drop: (point: Position) => void;
  on_cancel: () => void;
  on_menu: (name: string, point: Position) => void;
}

interface Press {
  name: string;
  start: Position;
  touch: number;
  target: EventTarget;
  timer: ReturnType<typeof setTimeout> | undefined;
  held: boolean;
}

interface MousePress {
  name: string;
  start: Position;
  last: Position;
  pointer: number;
  dragging: boolean;
}

/**
 * Hold a home item to pick it up and drag it in the same touch (ADR-016, 2026-10-25).
 *
 * Touch runs on touch events, not pointer events. Samsung Internet sent `pointercancel` under a still finger before a
 * pointer-based hold could take the gesture, and pointer events never resume after that, while touch events keep
 * coming. While the hold is pending, every `touchmove` inside the slop is cancelled, so a drifting finger never gives the
 * browser a move it could start a scroll with; past the slop it's a swipe and the browser gets the rest of the touch.
 * Once the hold fires, every move is cancelled (still cancelable: no scroll has started) and drives the drag, and the
 * cancelled `touchend` keeps the browser from clicking. The listeners sit on the touched node itself, so the touch
 * survives that node being re-rendered when edit mode opens.
 */
export function home_gesture(options: HomeGestureOptions): Attachment<HTMLElement> {
  return (element) => {
    let press: Press | null = null;
    let mouse: MousePress | null = null;
    let swallow_click = false;

    const item_of = (target: EventTarget | null) => {
      const node = target as Element | null;
      if (!node?.closest || node.closest(IGNORE)) return null;
      return node.closest<HTMLElement>(ITEM)?.dataset.homeName ?? null;
    };
    const touch_of = (event: TouchEvent) => Array.from(event.changedTouches).find((touch) => touch.identifier === press?.touch);
    const at = (point: { clientX: number; clientY: number }): Position => ({ x: point.clientX, y: point.clientY });

    function release() {
      if (!press) return;
      clearTimeout(press.timer);
      press.target.removeEventListener("touchmove", on_touch_move as EventListener);
      press.target.removeEventListener("touchend", on_touch_end as EventListener);
      press.target.removeEventListener("touchcancel", on_touch_cancel as EventListener);
      press = null;
    }

    function hold() {
      if (!press || press.held) return;
      clearTimeout(press.timer);
      press.timer = undefined;
      press.held = true;
      options.on_pick(press.name, press.start);
    }

    function on_touch_start(event: TouchEvent) {
      if (press) {
        if (press.held) options.on_cancel();
        return release();
      }
      if (event.touches.length !== 1) return;
      const name = item_of(event.target);
      const touch = event.changedTouches[0];
      if (!name || !touch || !event.target) return;
      press = { name, start: at(touch), touch: touch.identifier, target: event.target, timer: setTimeout(hold, options.hold_ms()), held: false };
      event.target.addEventListener("touchmove", on_touch_move as EventListener, { passive: false });
      event.target.addEventListener("touchend", on_touch_end as EventListener, { passive: false });
      event.target.addEventListener("touchcancel", on_touch_cancel as EventListener);
    }

    function on_touch_move(event: TouchEvent) {
      const touch = touch_of(event);
      if (!press || !touch) return;
      if (press.held) {
        if (event.cancelable) event.preventDefault();
        options.on_move(at(touch));
        return;
      }
      if (Math.hypot(touch.clientX - press.start.x, touch.clientY - press.start.y) > SLOP_PX) return release();
      if (event.cancelable) event.preventDefault();
    }

    function on_touch_end(event: TouchEvent) {
      const touch = touch_of(event);
      if (!press || !touch) return;
      if (press.held) {
        if (event.cancelable) event.preventDefault();
        options.on_drop(at(touch));
      }
      release();
    }

    function on_touch_cancel(event: TouchEvent) {
      if (!press || !touch_of(event)) return;
      if (press.held) options.on_cancel();
      release();
    }

    function on_context_menu(event: MouseEvent) {
      const name = item_of(event.target);
      if (!name) return;
      event.preventDefault();
      const type = (event as Partial<PointerEvent>).pointerType;
      // Android's own long press can beat the timer (Samsung Internet does on text); take it as the hold.
      if (type === "touch" || type === "pen") hold();
      else if (!press) options.on_menu(name, at(event));
    }

    function on_pointer_down(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0 || !options.mouse_drags()) return;
      const name = item_of(event.target);
      if (!name) return;
      mouse = { name, start: at(event), last: at(event), pointer: event.pointerId, dragging: false };
    }

    function on_pointer_move(event: PointerEvent) {
      if (!mouse || event.pointerId !== mouse.pointer) return;
      mouse.last = at(event);
      if (!mouse.dragging) {
        if (Math.hypot(event.clientX - mouse.start.x, event.clientY - mouse.start.y) <= SLOP_PX / 2) return;
        mouse.dragging = true;
        element.setPointerCapture(event.pointerId);
        options.on_pick(mouse.name, mouse.start);
      }
      options.on_move(mouse.last);
    }

    function on_pointer_up(event: PointerEvent) {
      if (!mouse || event.pointerId !== mouse.pointer) return;
      mouse.last = at(event);
      if (!mouse.dragging) mouse = null;
    }

    function on_lost_capture(event: PointerEvent) {
      if (!mouse || event.pointerId !== mouse.pointer) return;
      const finished = mouse;
      mouse = null;
      swallow_click = true;
      options.on_drop(finished.last);
    }

    function on_click(event: MouseEvent) {
      if (!swallow_click) return;
      swallow_click = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    // Non-passive only so the list is a blocking touch region before any touch lands; a listener added on the target
    // mid-touch may come too late for a browser that decides at touchstart whether the moves can be cancelled.
    element.addEventListener("touchstart", on_touch_start, { passive: false });
    element.addEventListener("contextmenu", on_context_menu);
    element.addEventListener("pointerdown", on_pointer_down);
    element.addEventListener("pointermove", on_pointer_move);
    element.addEventListener("pointerup", on_pointer_up);
    element.addEventListener("lostpointercapture", on_lost_capture);
    element.addEventListener("click", on_click, { capture: true });

    return () => {
      release();
      element.removeEventListener("touchstart", on_touch_start);
      element.removeEventListener("contextmenu", on_context_menu);
      element.removeEventListener("pointerdown", on_pointer_down);
      element.removeEventListener("pointermove", on_pointer_move);
      element.removeEventListener("pointerup", on_pointer_up);
      element.removeEventListener("lostpointercapture", on_lost_capture);
      element.removeEventListener("click", on_click, { capture: true });
    };
  };
}
