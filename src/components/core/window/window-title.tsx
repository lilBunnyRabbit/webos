import { useWindow, useWindowToolbar } from "@/contexts/window";
import {
  calculateWindowMove,
  detectSnapZone,
  useWindowsActions,
  useWindowsContainer,
  WindowFlag,
  type WindowInstance,
} from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { Copy, Minus, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";

interface WindowTitleProps {
  instance: WindowInstance;
}

export function WindowTitle({ instance }: WindowTitleProps) {
  const { zoom, setZoom } = useWindowToolbar();
  const { setPosition, size, snapZone, setSnapZone, toSnapZone } = useWindow();
  const dispatch = useWindowsActions();
  const bounds = useWindowsContainer();

  const [isDragging, setIsDragging] = React.useState(false);

  const isMaximized = instance.flags.has(WindowFlag.MAXIMIZED);

  const dragOffsetRef = React.useRef({ x: 0, y: 0, xPercent: 0, yPercent: 0 });
  const windowRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      const rect = windowRef.current?.parentElement?.getBoundingClientRect();

      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        dragOffsetRef.current = {
          x,
          y,
          xPercent: x / rect.width,
          yPercent: y / rect.height,
        };
      } else {
        dragOffsetRef.current = {
          x: 0,
          y: 0,
          xPercent: 0,
          yPercent: 0,
        };
      }

      setSnapZone(null);
      setIsDragging(true);
    },
    [setSnapZone]
  );

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const position = {
        x: e.clientX,
        y: e.clientY,
      };

      // Detect snap zone based on cursor position
      setSnapZone(detectSnapZone(position, bounds));

      if (instance.snapZone) {
        // Adjust drag offset based on the restored window size (size before snap/maximize)
        dragOffsetRef.current.x = dragOffsetRef.current.xPercent * size.width;

        dispatch({ type: "SET_SNAP_ZONE", windowId: instance.id, snapZone: null });
      }

      setPosition(
        calculateWindowMove(position, size, bounds, {
          x: dragOffsetRef.current.x,
          y: dragOffsetRef.current.y,
        })
      );
    },
    [isDragging, setSnapZone, bounds, instance, setPosition, size, dispatch]
  );

  const handleMouseUp = React.useCallback(() => {
    if (snapZone) {
      toSnapZone(snapZone);
    }

    setIsDragging(false);
    setSnapZone(null);
    dragOffsetRef.current = {
      x: 0,
      y: 0,
      xPercent: 0,
      yPercent: 0,
    };
  }, [snapZone, setSnapZone, toSnapZone]);

  React.useEffect(() => {
    if (!isDragging) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={windowRef}
      className={cn(
        "text-background px-4 py-2 flex items-center justify-between select-none cursor-grab",
        isDragging && "cursor-grabbing",
        isMaximized && "cursor-default"
      )}
      onMouseDown={isMaximized ? undefined : handleMouseDown}
    >
      <div
        className="flex items-center space-x-2"
        onDoubleClick={() => dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id })}
      >
        <div className="flex items-center justify-center w-4 h-4">{React.createElement(instance.app.icon)}</div>
        <span className="text-sm font-medium">{instance.app.name}</span>
      </div>

      <div className="flex items-center space-x-1">
        {/* Zoom Controls */}
        <div className="flex items-center space-x-1 mr-2 pl-2 border-l border-background">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoom((prev) => Math.max(prev - 0.25, 0.25));
            }}
            className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
            title="Zoom Out (Ctrl+-)"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoom(1);
            }}
            title="Reset Zoom (Ctrl+0)"
            className="text-xs text-background min-w-[2rem] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onFocus={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoom((prev) => Math.min(prev + 0.25, 3));
            }}
            className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
            title="Zoom In (Ctrl++)"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>

        {/* Window Controls */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onFocus={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dispatch({ type: "TOGGLE_WINDOW", windowId: instance.id });
          }}
          className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
          title="Minimize"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onFocus={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id });
          }}
          className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onFocus={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dispatch({ type: "DESTROY_WINDOW", windowId: instance.id });
          }}
          className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-red-500 rounded transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
