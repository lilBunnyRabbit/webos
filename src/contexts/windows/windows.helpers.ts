import type { Bounds, Dimensions, Position, ResizeDirection, SnapZone } from "./windows.type";
import type React from "react";

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
export function detectSnapZone({ x, y }: Position, bounds: Bounds): SnapZone {
  const EDGE_THRESHOLD = 10; // pixels from edge to trigger snap
  const CORNER_SIZE = 200; // size of corner zones

  // Check edges
  const isAtLeftEdge = x <= EDGE_THRESHOLD;
  const isAtRightEdge = x >= bounds.width - EDGE_THRESHOLD;
  const isAtTopEdge = y <= EDGE_THRESHOLD;
  const isAtBottomEdge = y >= bounds.height - EDGE_THRESHOLD - 56; // Account for taskbar (56px)

  // Check corners (smaller regions at the intersections)
  if (isAtLeftEdge && isAtTopEdge && x <= CORNER_SIZE && y <= CORNER_SIZE) {
    return "top-left";
  }
  if (isAtRightEdge && isAtTopEdge && x >= bounds.width - CORNER_SIZE && y <= CORNER_SIZE) {
    return "top-right";
  }
  if (isAtLeftEdge && isAtBottomEdge && x <= CORNER_SIZE && y >= bounds.height - CORNER_SIZE - 56) {
    return "bottom-left";
  }
  if (isAtRightEdge && isAtBottomEdge && x >= bounds.width - CORNER_SIZE && y >= bounds.height - CORNER_SIZE - 56) {
    return "bottom-right";
  }

  // Check edges (full height/width)
  if (isAtLeftEdge) return "left";
  if (isAtRightEdge) return "right";
  if (isAtTopEdge) return "top";
  if (isAtBottomEdge) return "bottom";
  return null;
}

const SNAP_PADDING = 8;

/**
 * Calculate position and size for a snapped window
 */
export function calculateSnapPosition(snapZone: SnapZone, bounds: Bounds): Bounds {
  switch (snapZone) {
    case "top":
      return {
        x: SNAP_PADDING,
        y: SNAP_PADDING,
        width: bounds.width - 2 * SNAP_PADDING,
        height: bounds.height / 2 - 1.5 * SNAP_PADDING,
      };

    case "bottom":
      return {
        x: SNAP_PADDING,
        y: bounds.height / 2 + 0.5 * SNAP_PADDING,
        width: bounds.width - 2 * SNAP_PADDING,
        height: bounds.height / 2 - 1.5 * SNAP_PADDING,
      };

    case "left":
      return {
        x: SNAP_PADDING,
        y: SNAP_PADDING,
        width: bounds.width / 2 - 1.5 * SNAP_PADDING,
        height: bounds.height - 2 * SNAP_PADDING,
      };

    case "right":
      return {
        x: bounds.width / 2 + 0.5 * SNAP_PADDING,
        y: SNAP_PADDING,
        width: bounds.width / 2 - 1.5 * SNAP_PADDING,
        height: bounds.height - 2 * SNAP_PADDING,
      };

    case "top-left":
      return {
        x: SNAP_PADDING,
        y: SNAP_PADDING,
        width: bounds.width / 2 - 1.5 * SNAP_PADDING,
        height: bounds.height / 2 - 1.5 * SNAP_PADDING,
      };

    case "top-right":
      return {
        x: bounds.width / 2 + 0.5 * SNAP_PADDING,
        y: SNAP_PADDING,
        width: bounds.width / 2 - 1.5 * SNAP_PADDING,
        height: bounds.height / 2 - 1.5 * SNAP_PADDING,
      };

    case "bottom-left":
      return {
        x: SNAP_PADDING,
        y: bounds.height / 2 + 0.5 * SNAP_PADDING,
        width: bounds.width / 2 - 1.5 * SNAP_PADDING,
        height: bounds.height / 2 - 1.5 * SNAP_PADDING,
      };

    case "bottom-right":
      return {
        x: bounds.width / 2 + 0.5 * SNAP_PADDING,
        y: bounds.height / 2 + 0.5 * SNAP_PADDING,
        width: bounds.width / 2 - 1.5 * SNAP_PADDING,
        height: bounds.height / 2 - 1.5 * SNAP_PADDING,
      };

    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function calculateSnapPositionPreview(snapZone: SnapZone): React.CSSProperties {
  switch (snapZone) {
    case "top":
      return {
        left: SNAP_PADDING,
        top: SNAP_PADDING,
        width: `calc(100% - ${2 * SNAP_PADDING}px)`,
        height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
      };

    case "bottom":
      return {
        left: SNAP_PADDING,
        top: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
        width: `calc(100% - ${2 * SNAP_PADDING}px)`,
        height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
      };

    case "left":
      return {
        left: SNAP_PADDING,
        top: SNAP_PADDING,
        width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        height: `calc(100% - ${2 * SNAP_PADDING}px)`,
      };

    case "right":
      return {
        left: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
        top: SNAP_PADDING,
        width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        height: `calc(100% - ${2 * SNAP_PADDING}px)`,
      };

    case "top-left":
      return {
        left: SNAP_PADDING,
        top: SNAP_PADDING,
        width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
      };

    case "top-right":
      return {
        left: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
        top: SNAP_PADDING,
        width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
      };

    case "bottom-left":
      return {
        left: SNAP_PADDING,
        top: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
        width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
      };

    case "bottom-right":
      return {
        left: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
        top: `calc(50% + ${0.5 * SNAP_PADDING}px)`,
        width: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
        height: `calc(50% - ${1.5 * SNAP_PADDING}px)`,
      };

    default:
      return {
        left: SNAP_PADDING,
        top: SNAP_PADDING,
        width: `calc(100% - ${2 * SNAP_PADDING}px)`,
        height: `calc(100% - ${2 * SNAP_PADDING}px)`,
      };
  }
}

export function getElementBounds(element?: HTMLDivElement | null): Bounds {
  if (!element) return { width: 0, height: 0, x: 0, y: 0 };

  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
  };
}

export function calculateWindowResize(position: Position, size: Dimensions, bounds: Bounds): Position | null {
  // Minimum visible area
  const minVisibleWidth = 100;
  const titleBarHeight = 40;

  let newX = position.x;
  let newY = position.y;
  let needsUpdate = false;

  // Check if window is outside viewport bounds - only move, don't resize
  if (position.x + size.width < minVisibleWidth) {
    newX = minVisibleWidth - size.width;
    needsUpdate = true;
  } else if (position.x > bounds.width - minVisibleWidth) {
    newX = bounds.width - minVisibleWidth;
    needsUpdate = true;
  }

  if (position.y + size.height < titleBarHeight) {
    newY = titleBarHeight - size.height;
    needsUpdate = true;
  } else if (position.y > bounds.height - titleBarHeight) {
    newY = bounds.height - titleBarHeight;
    needsUpdate = true;
  }

  if (needsUpdate) {
    return { x: newX, y: newY };
  }

  return null;
}

export function calculateWindowMove(
  position: Position,
  size: Dimensions,
  bounds: Bounds,
  dragOffset: Position
): Position {
  // Calculate new position
  let newX = position.x - dragOffset.x;
  let newY = position.y - dragOffset.y;

  // Constrain X position - ensure at least 100px of window is visible
  const minVisibleWidth = 100;
  const maxX = bounds.width - minVisibleWidth;
  const minX = -(size.width - minVisibleWidth);
  newX = Math.max(minX, Math.min(newX, maxX));

  // Constrain Y position - ensure title bar (40px) is always visible
  const titleBarHeight = 41;
  const maxY = bounds.height - titleBarHeight;
  const minY = -(size.height - titleBarHeight);
  newY = Math.max(0, Math.max(minY, Math.min(newY, maxY)));

  return {
    x: newX,
    y: newY,
  };
}

export function calculateWindowResizeDirection(
  target: Position,
  position: Position,
  size: Dimensions,
  bounds: Bounds,
  start: {
    direction: ResizeDirection;
    pointer: Position;
    size: Dimensions;
    position: Position;
  }
): Bounds {
  const deltaX = target.x - start.pointer.x;
  const deltaY = target.y - start.pointer.y;

  let newWidth = size.width;
  let newHeight = size.height;
  let newX = position.x;
  let newY = position.y;

  // Minimum and maximum sizes
  const minWidth = 300;
  const minHeight = 200;
  const maxWidth = bounds.width - 40;
  const maxHeight = bounds.height - 80;

  // Handle different resize directions
  if (start.direction.includes("e")) {
    // East (right)
    newWidth = Math.min(maxWidth, Math.max(minWidth, start.size.width + deltaX));
  }
  if (start.direction.includes("w")) {
    // West (left)
    newWidth = Math.min(maxWidth, Math.max(minWidth, start.size.width - deltaX));
    newX = Math.max(0, start.position.x + deltaX);
  }
  if (start.direction.includes("s")) {
    // South (bottom)
    newHeight = Math.min(maxHeight, Math.max(minHeight, start.size.height + deltaY));
  }
  if (start.direction.includes("n")) {
    // North (top)
    newHeight = Math.min(maxHeight, Math.max(minHeight, start.size.height - deltaY));
    newY = Math.max(0, start.position.y + deltaY);
  }

  // Ensure window doesn't go outside viewport bounds
  if (newX + newWidth > bounds.width) {
    newWidth = bounds.width - newX;
  }
  if (newY + newHeight > bounds.height) {
    newHeight = bounds.height - newY;
  }

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
}
