import Apps, { type AppId } from "@/apps";
import { useWindowsActions, WindowsContainerProvider } from "@/contexts/windows";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Taskbar } from "./taskbar";

// TODO: vibed
export function Desktop() {
  return (
    <div className="grid grid-cols-1 grid-rows-[1fr_min-content] h-[100dvh] w-full overflow-hidden bg-background-dark">
      <WindowsContainerProvider className="relative p-8 overflow-hidden">
        <Home />
      </WindowsContainerProvider>

      <Taskbar />
    </div>
  );
}

interface DesktopItem {
  appId: AppId;
  gridX: number;
  gridY: number;
}

interface DesktopItemComponentProps {
  item: DesktopItem;
  isBeingDragged: boolean;
  isClicked: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

const DesktopItemComponent = memo(
  ({ item, isBeingDragged, isClicked, onMouseDown, onDoubleClick }: DesktopItemComponentProps) => {
    const app = Apps[item.appId];
    const IconComponent = app.ICON;

    return (
      <div
        className={`flex flex-col items-center p-2 cursor-move hover:bg-white/10 rounded transition-colors duration-200 group ${
          isClicked ? "scale-95 bg-white/20" : ""
        } ${isBeingDragged ? "opacity-30" : ""}`}
        style={{
          gridColumn: item.gridX + 1,
          gridRow: item.gridY + 1,
        }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 mb-1 group-hover:scale-110 transition-transform duration-200 text-foreground ${
            isClicked ? "scale-90" : ""
          }`}
        >
          <IconComponent className="w-8 h-8" />
        </div>
        <span
          className={`text-xs text-foreground text-center leading-tight drop-shadow-sm transition-all duration-200 ${
            isClicked ? "scale-90" : ""
          }`}
        >
          {app.NAME}
        </span>
      </div>
    );
  }
);

DesktopItemComponent.displayName = "DesktopItemComponent";

function Home() {
  const dispatch = useWindowsActions();

  const [items, setItems] = useState<DesktopItem[]>(() => {
    // Initialize items with default grid positions
    const appEntries = Object.entries(Apps) as [AppId, (typeof Apps)[AppId]][];
    return appEntries.map(([appId], index) => ({
      appId,
      gridX: 0 + (index % 4), // Arrange in rows
      gridY: 0 + Math.floor(index / 4),
    }));
  });
  const [draggedItem, setDraggedItem] = useState<AppId | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropTarget, setDropTarget] = useState<{ gridX: number; gridY: number; isValid: boolean } | null>(null);
  const [clickedItem, setClickedItem] = useState<AppId | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [gridDimensions, setGridDimensions] = useState({ cols: 0, rows: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  const MIN_CELL_SIZE = 64;

  // Calculate optimal grid dimensions and cell size
  const calculateGridLayout = useCallback(() => {
    if (!gridRef.current) return { cols: 0, rows: 0, cellWidth: 0, cellHeight: 0 };

    const rect = gridRef.current.getBoundingClientRect();

    // Calculate how many columns fit (prefer cells closer to MAX_CELL_SIZE)
    const cols = Math.max(1, Math.floor(rect.width / MIN_CELL_SIZE));
    const cellWidth = rect.width / cols;

    // Calculate how many rows fit (prefer cells closer to MAX_CELL_SIZE)
    const rows = Math.max(1, Math.floor(rect.height / MIN_CELL_SIZE));
    const cellHeight = rect.height / rows;

    return { cols, rows, cellWidth, cellHeight };
  }, []);

  // Helper function to get actual cell dimensions
  const getCellSize = useCallback(() => {
    if (!gridRef.current) return { width: 0, height: 0 };
    const rect = gridRef.current.getBoundingClientRect();
    return {
      width: rect.width / gridDimensions.cols,
      height: rect.height / gridDimensions.rows,
    };
  }, [gridDimensions]);

  // Helper function to get grid dimensions
  const getGridDimensions = useCallback(() => {
    return { cols: gridDimensions.cols, rows: gridDimensions.rows };
  }, [gridDimensions]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, appId: AppId) => {
      e.preventDefault();
      setDragStartPos({ x: e.clientX, y: e.clientY });
      setDraggedItem(appId);

      const item = items.find((i) => i.appId === appId);
      if (item && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const itemElement = e.currentTarget as HTMLElement;
        const itemRect = itemElement.getBoundingClientRect();

        // Calculate offset from mouse to item's top-left corner
        setDragOffset({
          x: e.clientX - itemRect.left,
          y: e.clientY - itemRect.top,
        });

        // Set initial drag position
        setDragPosition({
          x: itemRect.left - gridRect.left,
          y: itemRect.top - gridRect.top,
        });
      }
    },
    [items]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && draggedItem && dropTarget && dropTarget.isValid) {
      setItems((prev) =>
        prev.map((item) =>
          item.appId === draggedItem ? { ...item, gridX: dropTarget.gridX, gridY: dropTarget.gridY } : item
        )
      );
    }

    setDraggedItem(null);
    setIsDragging(false);
    setDropTarget(null);
  }, [isDragging, draggedItem, dropTarget]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggedItem || !gridRef.current) return;

      // Check if we've moved enough to start dragging
      const deltaX = Math.abs(e.clientX - dragStartPos.x);
      const deltaY = Math.abs(e.clientY - dragStartPos.y);
      const dragThreshold = 5; // pixels

      if (!isDragging && (deltaX > dragThreshold || deltaY > dragThreshold)) {
        setIsDragging(true);
      }

      if (isDragging) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const { cols, rows } = getGridDimensions();
        const { width: cellWidth, height: cellHeight } = getCellSize();

        // Update position to follow mouse
        const x = e.clientX - gridRect.left - dragOffset.x;
        const y = e.clientY - gridRect.top - dragOffset.y;

        setDragPosition({ x, y });

        // Calculate drop target grid position from center of dragged item
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;

        const gridX = Math.max(0, Math.min(cols - 1, Math.floor(centerX / cellWidth)));
        const gridY = Math.max(0, Math.min(rows - 1, Math.floor(centerY / cellHeight)));

        // Check if target slot is occupied by another item
        const isOccupied = items.some(
          (item) => item.appId !== draggedItem && item.gridX === gridX && item.gridY === gridY
        );

        setDropTarget({ gridX, gridY, isValid: !isOccupied });
      }
    },
    [draggedItem, dragOffset, isDragging, dragStartPos, items, getCellSize, getGridDimensions]
  );

  const handleItemDoubleClick = useCallback(
    (appId: AppId) => {
      setClickedItem(appId);

      // Add a small delay for the click animation
      setTimeout(() => {
        dispatch({ type: "CREATE_WINDOW", appId });
        setClickedItem(null);
      }, 150);
    },
    [dispatch]
  );

  // Update grid dimensions on mount and resize
  useEffect(() => {
    const updateGridLayout = () => {
      const layout = calculateGridLayout();
      setGridDimensions({ cols: layout.cols, rows: layout.rows });
    };

    updateGridLayout();
    window.addEventListener("resize", updateGridLayout);
    return () => window.removeEventListener("resize", updateGridLayout);
  }, [calculateGridLayout]);

  useEffect(() => {
    if (draggedItem) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [draggedItem, handleMouseMove, handleMouseUp]);

  const { width: cellWidth, height: cellHeight } = getCellSize();
  const backgroundPattern =
    cellWidth > 0 && cellHeight > 0
      ? `url("data:image/svg+xml,%3Csvg width='${cellWidth}' height='${cellHeight}' viewBox='0 0 ${cellWidth} ${cellHeight}' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.25'%3E%3Ccircle cx='0' cy='0' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`
      : "none";

  return (
    <div
      ref={gridRef}
      className="w-full h-full overflow-hidden select-none relative"
      style={{
        backgroundImage: backgroundPattern,
        display: "grid",
        gridTemplateColumns: gridDimensions.cols > 0 ? `repeat(${gridDimensions.cols}, 1fr)` : "none",
        gridTemplateRows: gridDimensions.rows > 0 ? `repeat(${gridDimensions.rows}, 1fr)` : "none",
        gridAutoFlow: "dense",
      }}
    >
      {/* Drop target indicator */}
      {dropTarget && (
        <div
          className={`rounded border-2 pointer-events-none ${
            dropTarget.isValid ? "bg-white/30 border-white/50" : "bg-red-500/30 border-red-500/50"
          }`}
          style={{
            gridColumn: dropTarget.gridX + 1,
            gridRow: dropTarget.gridY + 1,
          }}
        />
      )}

      {/* Desktop items */}
      {gridDimensions.cols > 0 &&
        gridDimensions.rows > 0 &&
        items.map((item) => {
          const isBeingDragged = isDragging && draggedItem === item.appId;

          return (
            <DesktopItemComponent
              key={item.appId}
              item={item}
              isBeingDragged={isBeingDragged}
              isClicked={clickedItem === item.appId}
              onMouseDown={(e) => handleMouseDown(e, item.appId)}
              onDoubleClick={() => handleItemDoubleClick(item.appId)}
            />
          );
        })}

      {/* Dragged item following mouse */}
      {isDragging &&
        draggedItem &&
        (() => {
          const app = Apps[draggedItem];
          const IconComponent = app.ICON;
          const { width: cellWidth, height: cellHeight } = getCellSize();

          return (
            <div
              className="absolute flex flex-col items-center p-2 pointer-events-none z-50"
              style={{
                left: dragPosition.x,
                top: dragPosition.y,
                width: cellWidth,
                height: cellHeight,
              }}
            >
              <div className="flex items-center justify-center w-8 h-8 mb-1 text-primary">
                <IconComponent className="w-8 h-8" />
              </div>
              <span className="text-xs text-primary text-center leading-tight drop-shadow-sm">{app.NAME}</span>
            </div>
          );
        })()}
    </div>
  );
}
