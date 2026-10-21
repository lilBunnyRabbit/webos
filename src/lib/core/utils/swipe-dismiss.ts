import type { Attachment } from "svelte/attachments";
import { motion_reduced } from "./motion";
import { claims_drag, release_velocity, sheet_offset, should_dismiss, type DragSample } from "./sheet-gesture";

const SETTLE_MS = 200;

export interface SwipeDismissOptions {
  /** The surface's own Cancel or Back path, so its guards and promise run as they would for a tap. */
  on_dismiss: () => void;
  /** `false`: the sheet only rubber-bands. */
  dismissible?: boolean;
}

interface Drag {
  id: number;
  x: number;
  y: number;
  claimed: boolean | null;
  offset: number;
  samples: DragSample[];
}

/**
 * Swipe down to dismiss a bottom sheet, by touch only. Touch events rather than pointer events: whether the browser or
 * the sheet gets a drag depends on where the scroller under the finger sits when the drag starts, and only a cancelled
 * `touchmove` can take a gesture from the browser once it has begun; a static `touch-action` can't decide that.
 */
export function swipe_dismiss(options: SwipeDismissOptions): Attachment<HTMLElement> {
  return (element) => {
    let drag: Drag | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const dismissible = options.dismissible ?? true;

    function scrolled_under(target: EventTarget | null): boolean {
      for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
        if (node.scrollTop > 0) return true;
        if (node === element) break;
      }
      return false;
    }

    function place(offset: number, animate: boolean) {
      element.style.transition = animate ? `translate ${SETTLE_MS}ms var(--ease-out)` : "none";
      element.style.translate = offset ? `0 ${offset}px` : "";
    }

    function clear() {
      clearTimeout(settle);
      element.style.transition = "";
      element.style.translate = "";
    }

    function spring_back() {
      if (motion_reduced()) return clear();
      place(0, true);
      settle = setTimeout(clear, SETTLE_MS);
    }

    function dismiss(offset: number) {
      const finish = () => {
        options.on_dismiss();
        // A surface that stays open or only hides comes back to rest; one playing its Svelte outro (inert) stays put.
        requestAnimationFrame(() => {
          if (!element.inert) clear();
        });
      };
      if (motion_reduced()) return finish();
      place(offset + Math.max(0, innerHeight - element.getBoundingClientRect().top), true);
      settle = setTimeout(finish, SETTLE_MS);
    }

    function on_start(event: TouchEvent) {
      // Not a sheet: laid out in flow (a side panel in a wide window), or an empty box whose content escaped with
      // `fixed` (the full-screen introduction).
      if (event.touches.length !== 1 || element.offsetHeight === 0 || getComputedStyle(element).position === "static") {
        drag = null;
        return;
      }
      clearTimeout(settle);
      const touch = event.touches[0];
      drag = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        claimed: scrolled_under(event.target) || (event.target as Element).closest?.("input[type=range]") ? false : null,
        offset: 0,
        samples: [{ y: touch.clientY, t: event.timeStamp }],
      };
    }

    function on_move(event: TouchEvent) {
      if (!drag || drag.claimed === false) return;
      const touch = Array.from(event.changedTouches).find((each) => each.identifier === drag?.id);
      if (!touch) return;
      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;
      if (drag.claimed === null) {
        drag.claimed = event.cancelable && claims_drag({ dx, dy, scrolled: false });
        if (!drag.claimed) return;
      }
      event.preventDefault();
      drag.offset = sheet_offset(dy, dismissible);
      drag.samples.push({ y: touch.clientY, t: event.timeStamp });
      if (drag.samples.length > 12) drag.samples.shift();
      place(drag.offset, false);
    }

    function on_end(event: TouchEvent) {
      if (!drag || !Array.from(event.changedTouches).some((each) => each.identifier === drag?.id)) return;
      const { claimed, offset, samples } = drag;
      drag = null;
      if (!claimed) return;
      const release = { offset, height: element.offsetHeight, velocity: release_velocity(samples), dismissible };
      if (event.type === "touchend" && should_dismiss(release)) dismiss(offset);
      else spring_back();
    }

    element.addEventListener("touchstart", on_start, { passive: true });
    element.addEventListener("touchmove", on_move, { passive: false });
    element.addEventListener("touchend", on_end);
    element.addEventListener("touchcancel", on_end);
    return () => {
      element.removeEventListener("touchstart", on_start);
      element.removeEventListener("touchmove", on_move);
      element.removeEventListener("touchend", on_end);
      element.removeEventListener("touchcancel", on_end);
      clear();
    };
  };
}
