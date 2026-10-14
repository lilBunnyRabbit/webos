import type { WindowHandle } from "./type";

export function confirm_discard(win: Pick<WindowHandle, "confirm">, name: string): Promise<boolean> {
  return win.confirm(`Discard changes to “${name}”?`, {
    detail: "Your unsaved changes will be lost.",
    confirm_label: "Discard",
    danger: true,
  });
}
