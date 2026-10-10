import kernel, { WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
import type { Bounds } from "$lib/core/utils/type";
import type { WindowHandle } from "./type";

const NO_BOUNDS: Readonly<Bounds> = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

// Reads the service on every access, so reactivity comes from the service's state and a swapped WindowsService just works.
export function create_window_handle(id: WindowId): WindowHandle {
  const windows = () => kernel.service<WindowsService>("windows");
  const has = (flag: WindowFlag) => windows().get(id)?.flags.has(flag) ?? false;

  return {
    id,
    get is_focused() {
      return windows().is_focused(id);
    },
    get is_maximized() {
      return has(WindowFlag.MAXIMIZED);
    },
    get is_minimized() {
      return has(WindowFlag.MINIMIZED);
    },
    get bounds() {
      return windows().get(id)?.bounds ?? NO_BOUNDS;
    },

    focus() {
      windows().focus(id);
    },
    close() {
      windows().close(id);
    },
    minimize() {
      if (!has(WindowFlag.MINIMIZED)) windows().toggle_minimize(id);
    },
    maximize() {
      if (has(WindowFlag.MINIMIZED)) windows().toggle_minimize(id);
      if (!has(WindowFlag.MAXIMIZED)) windows().toggle_maximize(id);
    },
    restore() {
      if (has(WindowFlag.MINIMIZED)) windows().toggle_minimize(id);
      else if (has(WindowFlag.MAXIMIZED)) windows().toggle_maximize(id);
    },
  };
}
