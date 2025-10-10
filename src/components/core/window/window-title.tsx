import Apps from "@/apps";
import { useWindow, useWindowToolbar } from "@/contexts/window";
import {
  calculateWindowMove,
  detectSnapZone,
  useWindowsActions,
  useWindowsContainer,
  type WindowInstance,
} from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { Copy, Minus, RotateCcw, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";

interface WindowTitleProps {
  instance: WindowInstance;
}

export function WindowTitle({ instance }: WindowTitleProps) {
  const { zoom, setZoom } = useWindowToolbar();
  const { setPosition, size, snapZone, setSnapZone, toSnapZone } = useWindow();

  const dispatch = useWindowsActions();
  const bounds = useWindowsContainer();

  const appConfig = React.useMemo(() => Apps[instance.appId], [instance.appId]);

  const [isDragging, setIsDragging] = React.useState(false);

  const dragOffsetRef = React.useRef({ x: 0, y: 0 });
  const windowRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      const rect = windowRef.current?.parentElement?.getBoundingClientRect();

      if (rect) {
        dragOffsetRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      } else {
        dragOffsetRef.current = {
          x: 0,
          y: 0,
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

      setPosition(
        calculateWindowMove(position, size, bounds, {
          x: dragOffsetRef.current.x,
          y: dragOffsetRef.current.y,
        })
      );
    },
    [isDragging, size, setPosition, setSnapZone, bounds]
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
        instance.isMaximized && "cursor-default"
      )}
      onMouseDown={instance.isMaximized ? undefined : handleMouseDown}
    >
      <div
        className="flex items-center space-x-2"
        onDoubleClick={() => dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id })}
      >
        <div className="flex items-center justify-center w-4 h-4">{React.createElement(appConfig.ICON)}</div>
        <span className="text-sm font-medium">{appConfig.NAME}</span>
      </div>

      <div className="flex items-center space-x-1">
        {/* Zoom Controls */}
        <div className="flex items-center space-x-1 mr-2 pl-2 border-l border-background">
          <button
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
          <span className="text-xs text-background min-w-[2rem] text-center">{Math.round(zoom * 100)}%</span>
          <button
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
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoom(1);
            }}
            className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
            title="Reset Zoom (Ctrl+0)"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Window Controls */}
        <button
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id });
          }}
          className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
          title={instance.isMaximized ? "Restore" : "Maximize"}
        >
          {instance.isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
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
