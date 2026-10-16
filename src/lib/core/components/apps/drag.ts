import type { AppId } from "$lib/core/api";

/** Native drag of an app (ADR-042): the desktop and the taskbar's quick launch take it and pin the app. */
export const APP_TYPE = "application/x-webos-app";
/** Also set by a quick launch icon, so its own zone reorders and the desktop leaves it alone. */
export const QUICK_LAUNCH_TYPE = "application/x-webos-quick-launch";

export function set_drag_app(event: DragEvent, id: AppId, options: { quick_launch?: boolean } = {}): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(APP_TYPE, id);
  if (options.quick_launch) event.dataTransfer.setData(QUICK_LAUNCH_TYPE, id);
  event.dataTransfer.effectAllowed = options.quick_launch ? "move" : "copy";
}

/** Readable during `dragover`, when the data itself isn't. */
export function has_drag_app(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(APP_TYPE) ?? false;
}

export function is_quick_launch_drag(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(QUICK_LAUNCH_TYPE) ?? false;
}

export function read_drag_app(event: DragEvent): AppId | null {
  return event.dataTransfer?.getData(APP_TYPE) || null;
}
