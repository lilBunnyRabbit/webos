import type { AppId, DesktopGrid } from "..";

export class DesktopHelper {
  public static calculate_item_position(
    dimensions: { columns: number; rows: number },
    grid: DesktopGrid
  ): [x: number, y: number] {
    return [0, 0];
  }
}

/*
function recalculateGridPositions(
  grid: ContainerConfig["grid"],
  items: Partial<Record<AppId, ItemConfig>>
): Partial<Record<AppId, ItemConfig>> {
  const recalculatedItems: Partial<Record<AppId, ItemConfig>> = {};
  const occupiedPositions = new Set<string>();

  // Helper to mark a position as occupied
  const markPosition = (x: number, y: number) => occupiedPositions.add(`${x},${y}`);
  
  // Helper to check if a position is valid and available
  const isPositionValid = (x: number, y: number) => {
    return x >= 0 && x < grid.columns && y >= 0 && y < grid.rows && !occupiedPositions.has(`${x},${y}`);
  };

  // Helper to find the first available position
  const findNextAvailablePosition = (): { x: number; y: number } => {
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.columns; x++) {
        if (isPositionValid(x, y)) {
          return { x, y };
        }
      }
    }
    // If grid is full, place at 0,0 (shouldn't happen in normal usage)
    return { x: 0, y: 0 };
  };

  // Iterate over all items
  Object.entries(items).forEach(([appId, itemConfig]) => {
    if (!itemConfig) return;

    const { x, y } = itemConfig.grid;

    // Check if current position is valid
    if (isPositionValid(x, y)) {
      // Keep the item in its current position
      recalculatedItems[appId as AppId] = itemConfig;
      markPosition(x, y);
    } else {
      // Find a new position for the item
      const newPosition = findNextAvailablePosition();
      recalculatedItems[appId as AppId] = {
        ...itemConfig,
        grid: newPosition,
      };
      markPosition(newPosition.x, newPosition.y);
    }
  });

  return recalculatedItems;
}

function calculateNewItemPosition(
  grid: ContainerConfig["grid"],
  items: Partial<Record<AppId, ItemConfig>>,
  item?: ItemConfig
): ItemConfig {
  // Helper to check if a position is taken
  const isPositionTaken = (x: number, y: number): boolean => {
    return Object.values(items).some((existingItem) => existingItem?.grid.x === x && existingItem?.grid.y === y);
  };

  // Helper to check if a position is valid (within bounds and not taken)
  const isPositionValid = (x: number, y: number): boolean => {
    return x >= 0 && x < grid.columns && y >= 0 && y < grid.rows && !isPositionTaken(x, y);
  };

  // If item config exists, validate it
  if (item) {
    const { x, y } = item.grid;
    // Check if position is valid and not taken
    if (isPositionValid(x, y)) {
      return item;
    }
  }

  // Find the first empty position in the grid (column by column, top to bottom)
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.columns; x++) {
      if (isPositionValid(x, y)) {
        return {
          grid: { x, y },
        };
      }
    }
  }

  // Fallback to 0,0 if grid is full (shouldn't happen in normal usage)
  return {
    grid: { x: 0, y: 0 },
  };
}

*/
