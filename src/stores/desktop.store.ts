import type { AppId } from "@/apps";
import type { Bounds, Dimensions } from "@/contexts/windows";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ItemConfig {
  grid: {
    x: number;
    y: number;
  };
}

interface ContainerConfig {
  bounds: Bounds;
  cell: Dimensions;
  grid: {
    columns: number;
    rows: number;
  };
}

interface DesktopState {
  container: ContainerConfig;
  items: Partial<Record<AppId, ItemConfig>>;
}

interface DesktopStore extends DesktopState {
  addItem: (appId: AppId, item?: ItemConfig) => void;
  updateItem: (appId: AppId, update: Partial<ItemConfig>) => void;
  removeItem: (appId: AppId) => void;
  hasItemInPosition: (x: number, y: number) => boolean;
  setContainer: (container: ContainerConfig) => void;
}

export const useDesktopStore = create<DesktopStore>()(
  persist(
    (set, get) => ({
      items: {
        settings: {
          grid: {
            x: 0,
            y: 0,
          },
        },
      },
      container: {
        bounds: {
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        },
        cell: {
          width: 0,
          height: 0,
        },
        grid: {
          columns: 0,
          rows: 0,
        },
      },
      addItem: (appId, item) => {
        return set((state) => ({
          items: {
            ...state.items,
            [appId]: calculateNewItemPosition(get().container.grid, get().items, item),
          },
        }));
      },
      updateItem: (appId, update) => {
        return set((state) => ({ items: { ...state.items, [appId]: { ...state.items[appId], ...update } } }));
      },
      removeItem: (appId) => {
        return set((state) => {
          const clone = { ...state.items };
          delete clone[appId];

          return { items: clone };
        });
      },
      hasItemInPosition: (x, y) => {
        return Object.values(get().items).some((item) => item.grid.x === x && item.grid.y === y);
      },
      setContainer: (container) => {
        const oldContainer = get().container;

        if (container.grid.columns === oldContainer.grid.columns && container.grid.rows === oldContainer.grid.rows) {
          return set(() => ({ container }));
        }

        return set(() => ({ container, items: recalculateGridPositions(container.grid, get().items) }));
      },
    }),
    {
      name: "desktop",
    }
  )
);

// TODO: vibed

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
