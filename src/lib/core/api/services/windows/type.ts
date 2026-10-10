import type { IService } from "../../type";
import { Flags } from "$lib/core/utils/flags";
import type { Bounds, PartialRecord } from "$lib/core/utils/type";
import type { AppInstance } from "../apps/type";

/**
 * Service for managing windows lifecycle, state, and operations.
 * Handles window creation, destruction, focusing, and state manipulation.
 */
export interface WindowsService extends IService {
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
   * Snaps a window to a specific zone (edge or corner).
   * @param id - The window ID to snap
   * @param zone - The snap zone to snap to, or `null` to unsnap
   * @returns `true` if the window was snapped, `false` if it didn't exist
   */
  snap(id: WindowId, zone: SnapZone | null): boolean;

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

export type WindowId = string;

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
  // TODO: max size is not used
  constraints: WindowConstraints;
  bounds: Bounds;
  app: AppInstance;
}

export interface WindowOptions {
  constraints?: WindowConstraints;
  flags?: Iterable<WindowFlag>;
  snap_zone?: SnapZone | null;
}
