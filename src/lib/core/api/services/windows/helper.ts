import type { WindowConstraints } from "./type";
import type { Bounds } from "$lib/core/utils/type";

/** How far a second window of an app sits from its frontmost one. */
export const CASCADE_OFFSET = 28;

/** A first-ever window's share of the window area (ADR-014 revision). */
const DEFAULT_SHARE = { width: 0.62, height: 0.7 };

/** How much of a window's titlebar must stay on screen when the area shrinks: enough to grab and drag back. */
export const REACHABLE = { width: 96, titlebar: 40 };

/** Before the window area is measured there's nothing to scale against. */
const FALLBACK_SIZE = { width: 600, height: 400 };

export interface PlacementInput {
  constraints: WindowConstraints;
  container: Bounds;
  /** The frontmost open window of the same app: the new one cascades from it. */
  sibling: Bounds | null;
  /** The frame the app's last closed window had. */
  frame: Bounds | null;
}

export class WindowsHelper {
  /**
   * Where a new window opens (ADR-014 revision): cascaded from the app's frontmost window, else its remembered frame, else
   * centred at a share of the area. Always ends fully inside the container: a frame from a bigger screen shrinks and
   * moves back in, and a cascade that would overflow wraps to the top-left.
   */
  public static place(input: PlacementInput): Bounds {
    const { constraints, container, sibling, frame } = input;
    const measured = container.width > 0 && container.height > 0;

    const fit = (value: number, limits: { min?: number; max?: number } = {}, available: number) => {
      const constrained = Math.max(limits.min ?? 0, Math.min(limits.max ?? Infinity, value));
      return Math.round(measured ? Math.min(available, constrained) : constrained);
    };

    const base = sibling ?? frame;
    const width = fit(base ? base.width : measured ? container.width * DEFAULT_SHARE.width : FALLBACK_SIZE.width, constraints.width, container.width);
    const height = fit(base ? base.height : measured ? container.height * DEFAULT_SHARE.height : FALLBACK_SIZE.height, constraints.height, container.height);

    let x: number;
    let y: number;
    if (sibling) {
      x = sibling.x + CASCADE_OFFSET;
      y = sibling.y + CASCADE_OFFSET;
      if (measured && (x + width > container.width || y + height > container.height)) {
        x = 0;
        y = 0;
      }
    } else if (frame) {
      x = frame.x;
      y = frame.y;
    } else {
      // Optically centred: a little above the middle, like native first windows.
      x = Math.round((container.width - width) / 2);
      y = Math.round((container.height - height) * 0.4);
    }

    return WindowsHelper.clamp_bounds({ x, y, width, height }, container);
  }

  /**
   * Moves a window just enough that a grab-able strip of its titlebar is on screen (macOS/Windows behaviour). Size is
   * untouched, so growing the area back doesn't leave windows squeezed.
   */
  public static keep_reachable(bounds: Bounds, container: Bounds): Bounds {
    if (container.width <= 0 || container.height <= 0) return { ...bounds };
    return {
      ...bounds,
      x: Math.max(REACHABLE.width - bounds.width, Math.min(bounds.x, container.width - REACHABLE.width)),
      y: Math.max(0, Math.min(bounds.y, container.height - REACHABLE.titlebar)),
    };
  }

  /** Pulls saved bounds back inside the container, which may be smaller than when they were saved. */
  public static clamp_bounds(bounds: Bounds, container: Bounds): Bounds {
    // An unmeasured container (0×0) can't clamp anything yet.
    if (container.width <= 0 || container.height <= 0) return { ...bounds };

    const width = Math.min(bounds.width, container.width);
    const height = Math.min(bounds.height, container.height);
    return {
      width,
      height,
      x: Math.min(Math.max(0, bounds.x), container.width - width),
      y: Math.min(Math.max(0, bounds.y), container.height - height),
    };
  }
}
