import { motion_reduced } from "$lib/core/utils/motion";

const glides = new WeakMap<HTMLElement, number>();

/** A glide takes longer the farther it goes, within these bounds; past `CUT_AT` viewports it fades and cuts instead. */
const GLIDE_MIN = 340;
const GLIDE_PER_PX = 0.12;
const GLIDE_MAX = 760;
const CUT_AT = 1.5;
const CUT_OUT = 110;
const CUT_IN = 200;
const MAX_FRAME = 34;

/**
 * Scrolls the page so the node's top sits at the top of the view, below the scroll padding. The target comes from layout
 * (`offsetTop`), never from the box on screen: a window still rising into place is drawn lower than where it will rest,
 * and aiming at its drawn top would park its title bar under the edge.
 */
export function reveal(node: HTMLElement, block: ScrollLogicalPosition = "start"): void {
  const scroller = node.closest<HTMLElement>(".stage-pane");
  if (!scroller || block !== "start" || getComputedStyle(scroller).overflowY === "visible") {
    node.scrollIntoView({ behavior: motion_reduced() ? "instant" : "smooth", block, inline: "nearest" });
    return;
  }
  glide(scroller, offset_in(node, scroller) - pad_of(scroller, node));
}

/** `reveal` without the glide, for a link that opens the page on a window. */
export function land(node: HTMLElement): void {
  const scroller = node.closest<HTMLElement>(".stage-pane");
  if (scroller) scroller.scrollTop = offset_in(node, scroller) - pad_of(scroller, node);
}

function offset_in(node: HTMLElement, scroller: HTMLElement): number {
  let top = 0;
  for (let at: HTMLElement | null = node; at && at !== scroller; at = at.offsetParent as HTMLElement | null) top += at.offsetTop;
  return top;
}

function pad_of(scroller: HTMLElement, node: HTMLElement): number {
  return (parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(node).scrollMarginTop) || 0);
}

export function glide_time(distance: number): number {
  return Math.min(GLIDE_MAX, GLIDE_MIN + Math.abs(distance) * GLIDE_PER_PX);
}

export function cuts(distance: number, view: number): boolean {
  return Math.abs(distance) > view * CUT_AT;
}

export function glide(scroller: HTMLElement, target: number): void {
  cancelAnimationFrame(glides.get(scroller) ?? 0);
  const to = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, target));
  const from = scroller.scrollTop;
  const distance = to - from;
  if (motion_reduced() || Math.abs(distance) < 2) {
    scroller.scrollTop = to;
    return;
  }
  if (cuts(distance, scroller.clientHeight)) {
    const fade = scroller.animate([{ opacity: 1 }, { opacity: 0.35 }], { duration: CUT_OUT, easing: "ease-in", fill: "forwards" });
    void fade.finished.then(() => {
      scroller.scrollTop = to;
      fade.cancel();
      scroller.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: CUT_IN, easing: "ease-out" });
    }, () => {});
    return;
  }
  const time = glide_time(distance);
  let last = performance.now();
  let elapsed = 0;
  const stop = () => cancelAnimationFrame(glides.get(scroller) ?? 0);
  scroller.addEventListener("wheel", stop, { once: true, passive: true });
  scroller.addEventListener("touchstart", stop, { once: true, passive: true });
  scroller.addEventListener("pointerdown", stop, { once: true, passive: true });
  // A stalled frame (a window mounting on a slow device) stretches the glide instead of jumping it ahead.
  const step = (now: number) => {
    elapsed += Math.min(MAX_FRAME, Math.max(0, now - last));
    last = now;
    const t = Math.min(1, elapsed / time);
    const eased = (1 - Math.cos(Math.PI * t)) / 2;
    scroller.scrollTop = from + distance * eased;
    if (t < 1) glides.set(scroller, requestAnimationFrame(step));
    else glides.delete(scroller);
  };
  glides.set(scroller, requestAnimationFrame(step));
}

const EDGE = 12;

/** Scrolls a window's own body just enough to show the whole node, its top first when it can't fit; never the page. */
export function bring_into(node: HTMLElement): void {
  const body = node.closest<HTMLElement>(".body");
  if (!body) return;
  const view = body.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  let delta = 0;
  if (box.top < view.top + EDGE) delta = box.top - view.top - EDGE;
  else if (box.bottom > view.bottom - EDGE) delta = Math.min(box.bottom - view.bottom + EDGE, box.top - view.top - EDGE);
  if (Math.abs(delta) < 1) return;
  body.scrollBy({ top: delta, behavior: motion_reduced() ? "instant" : "smooth" });
}
