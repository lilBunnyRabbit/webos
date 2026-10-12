import type { IService } from "../../type";
import { Flags } from "$lib/core/utils/flags";
import type { Bounds, PartialRecord } from "$lib/core/utils/type";
import type { AppId, AppInstance, AppProps } from "../apps/type";

/**
 * Platform-neutral window management (ADR-016): lifecycle, focus, minimize/maximize, session restore. What code outside
 * the desktop shell may rely on. A mobile implementation is free to treat maximize and bounds as no-ops.
 */
export interface WindowsService extends IService {
  /** The element windows render in; dialogs anchor to it when nothing better is given. */
  readonly container: {
    element: HTMLElement | null;
  };

  /**
   * Closes a window by its ID.
   * @param id - The window ID to close
   * @returns `true` if the window was closed, `false` if it didn't exist
   */
  close(id: WindowId): boolean;

  /**
   * Closes all windows and resets the window manager state.
   */
  close_all(): void;

  /**
   * Checks if a window exists by its ID.
   * @param id - The window ID to check
   * @returns `true` if the window exists, `false` otherwise
   */
  exists(id: WindowId): boolean;

  /**
   * Focuses a window, bringing it to the front.
   * @param id - The window ID to focus
   * @returns `true` if the window was focused, `false` if it didn't exist or was already focused
   */
  focus(id: WindowId): boolean;

  /**
   * Retrieves a window instance by its ID.
   * @param id - The window ID to retrieve
   * @returns The window instance, or `null` if not found
   */
  get(id: WindowId): WindowInstance | null;

  /**
   * Gets the currently focused window ID.
   * @returns The focused window ID, or `null` if no window is focused
   */
  get_focused(): WindowId | null;

  /**
   * Checks if a window is currently focused.
   * @param id - The window ID to check
   * @returns `true` if the window is focused, `false` otherwise
   */
  is_focused(id: WindowId): boolean;

  /**
   * Lists all window IDs.
   * @returns An array of all window IDs
   */
  list(): WindowId[];

  /**
   * Lists all windows sorted by order.
   * @param compare - A comparison function to sort the windows
   * @returns An array of all windows sorted by order
   */
  sorted_list(
    compare?: (a: [WindowId, WindowInstance], b: [WindowId, WindowInstance]) => number
  ): [WindowId, WindowInstance][];

  /**
   * Opens a new window with the given options.
   * @param options - Window creation options including constraints
   * @returns The newly created window ID
   */
  open(app: AppInstance): WindowId;

  /**
   * Reopens saved windows with their geometry (ADR-023). `windows` is oldest-first in z-order, so the last one ends up
   * on top. `create` builds each app instance; returning `null` skips that window. Bounds are clamped into the
   * container, and the topmost visible window gets focus.
   */
  restore(windows: WindowSnapshot[], create: (snapshot: WindowSnapshot) => AppInstance | null): RestoreResult;

  /**
   * Toggles the maximized state of a window.
   * @param id - The window ID to toggle
   * @returns `true` if the window is now maximized, `false` if it's now unmaximized or didn't exist
   */
  toggle_maximize(id: WindowId): boolean;

  /**
   * Toggles the minimized state of a window.
   * @param id - The window ID to toggle
   * @returns `true` if the window is now minimized, `false` if it's now unminimized or didn't exist
   */
  toggle_minimize(id: WindowId): boolean;
}

/** The desktop shell's windows: positioned in a measured container, draggable, snappable (ADR-016). */
export interface DesktopWindowsService extends WindowsService {
  /** The container bounds for all windows */
  readonly container: {
    bounds: Bounds;
    element: HTMLElement | null;
  };

  /**
   * Sets the container bounds for all windows.
   * @param element - The element to set the container bounds from
   */
  set_container(element?: HTMLElement | null): Bounds;

  /**
   * Snaps a window to a specific zone (edge or corner).
   * @param id - The window ID to snap
   * @param zone - The snap zone to snap to, or `null` to unsnap
   * @returns `true` if the window was snapped, `false` if it didn't exist
   */
  snap(id: WindowId, zone: SnapZone | null): boolean;
}

export type WindowId = string;

/** A window as the session stores it: what to launch and where it was. */
export interface WindowSnapshot {
  app_id: AppId;
  props?: AppProps;
  bounds: Bounds;
  /** Only `minimized` and `maximized` are kept. */
  flags: WindowFlag[];
  snap_zone: SnapZone | null;
  /** The app instance's window state (`storage.window()`). Absent in sessions saved before it existed. */
  state?: Record<string, unknown>;
}

export interface RestoreResult {
  restored: WindowId[];
  /** Snapshots `create` refused: app gone or props no longer valid. */
  skipped: WindowSnapshot[];
}

export const WindowFlag = {
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
  DEBUG: "debug",
} as const;
export type WindowFlag = (typeof WindowFlag)[keyof typeof WindowFlag];

export const SnapZone = {
  TOP: "top",
  BOTTOM: "bottom",
  LEFT: "left",
  RIGHT: "right",
  TOP_LEFT: "top-left",
  TOP_RIGHT: "top-right",
  BOTTOM_LEFT: "bottom-left",
  BOTTOM_RIGHT: "bottom-right",
} as const;
export type SnapZone = (typeof SnapZone)[keyof typeof SnapZone];

export type WindowConstraints = PartialRecord<"width" | "height", PartialRecord<"min" | "max", number>>;

export interface WindowInstance {
  id: WindowId;
  created_at: Date;
  order: number;
  flags: Flags<WindowFlag>;
  snap_zone: SnapZone | null;
  constraints: WindowConstraints;
  bounds: Bounds;
  app: AppInstance;
}

export interface WindowOptions {
  constraints?: WindowConstraints;
  flags?: Iterable<WindowFlag>;
  snap_zone?: SnapZone | null;
}
