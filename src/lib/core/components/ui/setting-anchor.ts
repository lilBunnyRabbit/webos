import { motion_reduced } from "$lib/core/utils/motion";

export const TARGETED_ROW = "data-targeted:bg-primary/10 data-targeted:ring-2 data-targeted:ring-primary data-targeted:ring-inset";
export const TARGETED_SECTION = "outline-2 outline-offset-4 outline-transparent data-targeted:outline-primary";

const RING_MS = 2400;
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/**
 * Scrolls the `Section` or `SettingRow` whose `setting` is `id` into view inside `root` and rings it for a moment.
 * When focus would be left on something hidden (a drill-in list that just went away), it moves to the row's control.
 * `false` when nothing on the page has that id.
 */
export function reveal_setting(root: ParentNode, id: string): boolean {
  const target = root.querySelector<HTMLElement>(`[data-setting="${CSS.escape(id)}"]`);
  if (!target) return false;

  target.scrollIntoView({ block: "center", behavior: motion_reduced() ? "instant" : "smooth" });
  clearTimeout(timers.get(target));
  target.dataset.targeted = "";
  timers.set(
    target,
    setTimeout(() => delete target.dataset.targeted, RING_MS)
  );

  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body || !active.checkVisibility()) {
    target.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]")?.focus({ preventScroll: true });
  }
  return true;
}
