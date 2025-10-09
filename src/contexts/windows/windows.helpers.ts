import type { SnapZone } from "./windows.type";

/**
 * Calculate a cascading position for a new window (Windows-style stacking)
 * Each window is offset diagonally down-right from the starting position
 */
export function calculateWindowPosition(
  size: { width: number; height: number },
  windowCount: number
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const startX = 100;
  const startY = 100;
  const cascadeOffset = 40; // Offset for each new window

  // Calculate position based on number of existing windows
  const offsetMultiplier = windowCount % 15; // Reset after 15 windows

  let x = startX + offsetMultiplier * cascadeOffset;
  let y = startY + offsetMultiplier * cascadeOffset;

  // Ensure window doesn't go off screen
  const maxX = viewportWidth - size.width - 20;
  const maxY = viewportHeight - size.height - 80; // Account for taskbar

  if (x > maxX || y > maxY) {
    // Reset to start position if we've gone too far
    x = startX;
    y = startY;
  }

  return { x, y };
}

/**
 * Detect which snap zone the cursor is in based on mouse position
 */
export function detectSnapZone(x: number, y: number): SnapZone {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const EDGE_THRESHOLD = 10; // pixels from edge to trigger snap
  const CORNER_SIZE = 200; // size of corner zones

  // Check edges
  const isAtLeftEdge = x <= EDGE_THRESHOLD;
  const isAtRightEdge = x >= viewportWidth - EDGE_THRESHOLD;
  const isAtTopEdge = y <= EDGE_THRESHOLD;
  const isAtBottomEdge = y >= viewportHeight - EDGE_THRESHOLD - 56; // Account for taskbar (56px)

  // Check corners (smaller regions at the intersections)
  if (isAtLeftEdge && isAtTopEdge && x <= CORNER_SIZE && y <= CORNER_SIZE) {
    return "top-left";
  }
  if (isAtRightEdge && isAtTopEdge && x >= viewportWidth - CORNER_SIZE && y <= CORNER_SIZE) {
    return "top-right";
  }
  if (isAtLeftEdge && isAtBottomEdge && x <= CORNER_SIZE && y >= viewportHeight - CORNER_SIZE - 56) {
    return "bottom-left";
  }
  if (isAtRightEdge && isAtBottomEdge && x >= viewportWidth - CORNER_SIZE && y >= viewportHeight - CORNER_SIZE - 56) {
    return "bottom-right";
  }

  // Check edges (full height/width)
  if (isAtLeftEdge) return "left";
  if (isAtRightEdge) return "right";

  return null;
}

/**
 * Calculate position and size for a snapped window
 */
export function calculateSnapPosition(snapZone: SnapZone): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const TASKBAR_HEIGHT = 56;
  const PADDING = 8;

  const availableHeight = viewportHeight - TASKBAR_HEIGHT - PADDING * 2;
  const halfWidth = (viewportWidth - PADDING * 3) / 2;
  const halfHeight = (availableHeight - PADDING) / 2;

  switch (snapZone) {
    case "left":
      return {
        x: PADDING,
        y: PADDING,
        width: halfWidth,
        height: availableHeight,
      };
    case "right":
      return {
        x: halfWidth + PADDING * 2,
        y: PADDING,
        width: halfWidth,
        height: availableHeight,
      };
    case "top-left":
      return {
        x: PADDING,
        y: PADDING,
        width: halfWidth,
        height: halfHeight,
      };
    case "top-right":
      return {
        x: halfWidth + PADDING * 2,
        y: PADDING,
        width: halfWidth,
        height: halfHeight,
      };
    case "bottom-left":
      return {
        x: PADDING,
        y: halfHeight + PADDING * 2,
        width: halfWidth,
        height: halfHeight,
      };
    case "bottom-right":
      return {
        x: halfWidth + PADDING * 2,
        y: halfHeight + PADDING * 2,
        width: halfWidth,
        height: halfHeight,
      };
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}
