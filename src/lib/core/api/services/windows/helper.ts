import type { WindowConstraints } from "./type";
import type { Bounds } from "$lib/core/utils/type";

export class WindowsHelper {
  public static legacy_calculate_bounds(
    constraints: WindowConstraints,
    container: Bounds,
    window_count: number
  ): Bounds {
    const size = {
      width: Math.min(600, container.width),
      height: Math.min(400, container.height),
    };

    const start_x = 100;
    const start_y = 100;
    const cascade_offset = 40; // Offset for each new window

    // Calculate position based on number of existing windows
    const offset_multiplier = window_count % 15; // Reset after 15 windows

    let x = start_x + offset_multiplier * cascade_offset;
    let y = start_y + offset_multiplier * cascade_offset;

    // Ensure window doesn't go off screen (using container bounds if present)
    const max_x = container.width - size.width - 20;
    const max_y = container.height - size.height - 80; // Account for taskbar

    if (x > max_x || y > max_y) {
      // Reset to start position if we've gone too far
      x = start_x;
      y = start_y;
    }

    // Account for container offset if present
    x += container.x;
    y += container.y;

    return { x, y, ...size };
  }

  public static calculate_bounds(constraints: WindowConstraints, container: Bounds): Bounds {
    // Calculate width and height based on constraints and container size and calculated x/y

    // TODO: implement
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }
}
