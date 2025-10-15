import Apps, { type AppId } from "@/apps";
import { type Bounds, type Dimensions } from "@/contexts/windows";
import React, { useState } from "react";
import { DesktopItem } from "./desktop-item";
import { cn } from "@/lib/utils";

export interface DesktopItemConfig {
  appId: AppId;
  gridX: number;
  gridY: number;
}

export const CELL_SIZE = 64;

export const Desktop = ({ className }: { className?: string }) => {
  const [container, setContainer] = useState<{
    bounds: Bounds;
    cell: Dimensions;
  } | null>(null);
  const [gridDimensions, setGridDimensions] = useState({ cols: 0, rows: 0 });
  const [items, setItems] = useState<DesktopItemConfig[]>(() => {
    // Initialize items with default grid positions
    const appEntries = Object.entries(Apps) as [AppId, (typeof Apps)[AppId]][];
    return appEntries.map(([appId], index) => ({
      appId,
      gridX: 0 + (index % 4), // Arrange in rows
      gridY: 0 + Math.floor(index / 4),
    }));
  });

  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;

    const updateGridDimensions = () => {
      const element = ref.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const cols = Math.floor(bounds.width / CELL_SIZE);
      const rows = Math.floor(bounds.height / CELL_SIZE);

      setGridDimensions({ cols, rows });
      setContainer({ bounds, cell: { width: bounds.width / cols, height: bounds.height / rows } });
    };

    const resizeObserver = new ResizeObserver(updateGridDimensions);
    resizeObserver.observe(ref.current);

    // Initial call
    updateGridDimensions();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const hasItemInPosition = React.useCallback(
    (x: number, y: number) => {
      return items.some((item) => item.gridX === x && item.gridY === y);
    },
    [items]
  );

  return (
    <div
      ref={ref}
      className={cn("grid w-full h-full overflow-hidden bg-background-dark place-items-center", className)}
      style={{
        gridTemplateColumns: `repeat(${gridDimensions.cols}, minmax(64px, 1fr))`,
        gridTemplateRows: `repeat(${gridDimensions.rows}, minmax(64px, 1fr))`,
        gridAutoFlow: "dense",
        backgroundImage: container
          ? `url("data:image/svg+xml,%3Csvg width='${container.cell.width}' height='${container.cell.height}' viewBox='0 0 ${container.cell.width} ${container.cell.height}' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.25'%3E%3Ccircle cx='0' cy='0' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`
          : "none",
      }}
    >
      {container &&
        items.map((item, i) => (
          <DesktopItem
            key={item.appId}
            item={item}
            setItem={(newItem) => setItems((prev) => prev.map((item, j) => (i === j ? newItem : item)))}
            hasItemInPosition={hasItemInPosition}
            container={container}
          />
        ))}
    </div>
  );
};
