import Apps, { type AppId } from "@/apps";
import { useApps } from "@/core/contexts/apps";
import { type Bounds, type Dimensions, type Position } from "@/core/contexts/window-manager";
import { cn } from "@/core/lib/utils";
import { useDesktopStore } from "@/core/stores/desktop.store";
import React, { useState } from "react";

interface DesktopItemProps {
  appId: AppId;
  container: { bounds: Bounds; cell: Dimensions; grid: { columns: number; rows: number } };
}

export const DesktopItem = ({ appId, container }: DesktopItemProps) => {
  const { open: openApp } = useApps();

  const position = useDesktopStore((state) => state.items[appId]?.grid ?? { x: 0, y: 0 });
  const hasItemInPosition = useDesktopStore((state) => state.hasItemInPosition);
  const setItem = useDesktopStore((state) => state.updateItem);
  const removeItem = useDesktopStore((state) => state.removeItem);

  const [movePosition, setMovePosition] = useState<{ column: number; row: number } | null>(null);

  const [state, setState] = useState<
    | {
        type: "start";
        offset: Position;
        position: Position;
      }
    | {
        type: "move";
        offset: Position;
        position: Position;
      }
    | null
  >();

  const isBlocked = React.useMemo(() => {
    if (!state || state.type !== "move" || !movePosition) return false;
    return hasItemInPosition(movePosition.column - 1, movePosition.row - 1);
  }, [state, hasItemInPosition, movePosition]);

  const ref = React.useRef<HTMLButtonElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const app = Apps[appId];
  const IconComponent = app.ICON;

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();

    let offset = {
      x: 0,
      y: 0,
    };

    if (rect) {
      offset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    setState({
      type: "start",
      offset,
      position: {
        x: e.clientX,
        y: e.clientY,
      },
    });
  }, []);

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!state) return;

      if (state.type === "start") {
        // Check if we've moved enough to start dragging
        const deltaX = Math.abs(e.clientX - state.position.x);
        const deltaY = Math.abs(e.clientY - state.position.y);
        const dragThreshold = 8; // pixels

        if (deltaX < dragThreshold && deltaY < dragThreshold) return;

        setState({
          type: "move",
          offset: state.offset,
          position: state.position,
        });
      }

      // Get mouse position relative to parent
      const x = e.clientX - container.bounds.x;
      const y = e.clientY - container.bounds.y;

      if (previewRef.current) {
        previewRef.current.style.left = `${e.clientX - state.offset.x}px`;
        previewRef.current.style.top = `${e.clientY - state.offset.y}px`;
      }

      // Calculate new grid position based on mouse position & grid cell size (64px)
      const newGridX = Math.max(0, Math.min(Math.floor(x / container.cell.width), container.grid.columns - 1));
      const newGridY = Math.max(0, Math.min(Math.floor(y / container.cell.height), container.grid.rows - 1));

      setMovePosition({
        column: newGridX + 1,
        row: newGridY + 1,
      });
    },
    [container, state]
  );

  const handleMouseUp = React.useCallback(() => {
    if (!state) return;

    if (!isBlocked && movePosition) {
      setItem(appId, { grid: { x: movePosition.column - 1, y: movePosition.row - 1 } });
    }

    setState(null);
    setMovePosition(null);
  }, [state, isBlocked, setItem, appId, movePosition]);

  React.useEffect(() => {
    if (!state) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, state]);

  return (
    <>
      <button
        ref={ref}
        className={cn(
          "group w-full h-full flex flex-col items-center pt-2 px-1 gap-y-1 overflow-hidden hover:bg-foreground/10 rounded hover:overflow-visible cursor-grab",
          state?.type === "move" && "opacity-50",
          (!state || state.type === "start") &&
            "focus:outline-2 focus:outline-accent focus:bg-accent/10 focus:text-accent"
        )}
        onDoubleClick={() => openApp(appId)}
        onKeyUp={(e) => {
          if (e.key === "Delete" && document.activeElement === e.currentTarget) {
            removeItem(appId);
          }
        }}
        style={{
          gridColumn: position.x + 1,
          gridRow: position.y + 1,
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="h-8 w-8 overflow-hidden shrink-0">
          <IconComponent className="h-full w-auto" />
        </div>

        <span className="text-xs text-foreground/70 max-w-full px-1 line-clamp-1 group-hover:line-clamp-none group-focus:text-accent/70">
          {app.NAME}
        </span>
      </button>

      {state?.type === "move" && (
        <>
          {movePosition && (position.x !== movePosition.column - 1 || position.y !== movePosition.row - 1) && (
            <div
              className={cn(
                "w-full h-full bg-foreground/30 transition-all rounded-xl border-2 border-foreground/30",
                isBlocked && "bg-red-500/30 border-red-500/30"
              )}
              style={{
                gridColumn: movePosition.column,
                gridRow: movePosition.row,
              }}
            />
          )}
          <div
            ref={previewRef}
            className="fixed flex flex-col items-center pt-2 px-1 gap-y-1 overflow-hidden cursor-grabbing"
            style={{
              left: state.position.x - state.offset.x,
              top: state.position.y - state.offset.y,
              width: container.cell.width,
              height: container.cell.height,
            }}
          >
            <div className="h-8 w-8 overflow-hidden shrink-0">
              <IconComponent className="h-full w-auto" />
            </div>

            <span className="text-xs text-foreground/70 max-w-full px-1 line-clamp-1">{app.NAME}</span>
          </div>
        </>
      )}
    </>
  );
};
