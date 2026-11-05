import kernel, { type DialogsService } from "$lib/core/api";

// Window-level keys reach us while a menu or sheet has focus: Escape there must close it, not the viewer under it.
export function owns_key(event: KeyboardEvent, root: HTMLElement | undefined, focused: boolean): boolean {
  if (!focused || event.defaultPrevented || kernel.service<DialogsService>("dialogs").stack.length > 0) return false;
  const target = event.target;
  if (!(target instanceof Element) || target === document.body) return true;
  return !!root?.contains(target) && !target.closest("input, textarea, select, [contenteditable]");
}
