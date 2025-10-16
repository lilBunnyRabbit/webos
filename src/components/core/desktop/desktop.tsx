import { type AppId } from "@/apps";
import { cn } from "@/lib/utils";
import { useDesktopStore } from "@/stores/desktop.store";
import React from "react";
import { DesktopItem } from "./desktop-item";

export interface DesktopItemConfig {
  appId: AppId;
  gridX: number;
  gridY: number;
}

export const CELL_SIZE = 64;
const CONTAINER_PADDING = 4;

export const Desktop = ({ className }: { className?: string }) => {
  const items = useDesktopStore((state) => state.items);
  const container = useDesktopStore((state) => state.container);
  const setContainer = useDesktopStore((state) => state.setContainer);

  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;

    const updateGridDimensions = () => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();

      const bounds = {
        width: rect.width - CONTAINER_PADDING * 2,
        height: rect.height - CONTAINER_PADDING * 2,
        x: rect.left + CONTAINER_PADDING,
        y: rect.top + CONTAINER_PADDING,
      };

      const columns = Math.floor(bounds.width / CELL_SIZE);
      const rows = Math.floor(bounds.height / CELL_SIZE);

      setContainer({
        bounds,
        cell: { width: bounds.width / columns, height: bounds.height / rows },
        grid: { columns, rows },
      });
    };

    const resizeObserver = new ResizeObserver(updateGridDimensions);
    resizeObserver.observe(ref.current);

    // Initial call
    updateGridDimensions();

    return () => {
      resizeObserver.disconnect();
    };
  }, [setContainer]);

  return (
    <div
      ref={ref}
      className={cn("grid w-full h-full overflow-hidden bg-background-dark place-items-center", className)}
      style={{
        gridTemplateColumns: `repeat(${container.grid.columns}, minmax(64px, 1fr))`,
        gridTemplateRows: `repeat(${container.grid.rows}, minmax(64px, 1fr))`,
        gridAutoFlow: "dense",
        padding: CONTAINER_PADDING,
      }}
    >
      {container &&
        Object.keys(items).map((appId) => <DesktopItem key={appId} appId={appId as AppId} container={container} />)}
    </div>
  );
};
