import Apps from "@/apps";
import { useWindowsActions, useWindowsContainer, type WindowInstance } from "@/contexts/windows";
import {
  calculateSnapPosition,
  calculateSnapPositionPreview,
  calculateWindowMove,
  calculateWindowResize,
  calculateWindowResizeDirection,
  detectSnapZone,
} from "@/contexts/windows/windows.helpers";
import type { Dimensions, Position, ResizeDirection, SnapZone } from "@/contexts/windows/windows.type";
import { cn } from "@/lib/utils";
import { Copy, Loader, Minus, RotateCcw, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";

// TODO: vibed

interface WindowProps {
  instance: WindowInstance & { app: React.ReactNode };
  isFocused: boolean;
  order: number;
}

export function Window({ instance, isFocused, order }: WindowProps) {
  const dispatch = useWindowsActions();
  const bounds = useWindowsContainer();
  const appConfig = React.useMemo(() => Apps[instance.appId], [instance.appId]);
  const [snapZone, setSnapZone] = React.useState<SnapZone>(null);

  const [position, setPosition] = React.useState(
    instance.config.position ?? {
      x: 100,
      y: 100,
    }
  );
  const [size, setSize] = React.useState(
    instance.config.size ?? {
      width: 600,
      height: 400,
    }
  );
  const [zoomLevel, setZoomLevel] = React.useState(1);

  // Handle browser window resize - ensure window stays within viewport
  // TODO: this only needs to check the bounds change
  React.useEffect(() => {
    const onResize = () => {
      const newPosition = calculateWindowResize(position, size, bounds);

      if (newPosition) {
        setPosition(newPosition);
      }
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [position, size, bounds]);

  return (
    <>
      {snapZone && (
        <div
          className="absolute pointer-events-none z-[9999] bg-primary/30 border-2 border-primary rounded-lg transition-all duration-150"
          style={calculateSnapPositionPreview(snapZone)}
        />
      )}

      <div
        data-window-id={instance.id}
        onFocus={() => dispatch({ type: "FOCUS_WINDOW", windowId: instance.id })}
        className={cn(
          "absolute bg-primary shadow-window rounded-lg border-2 border-primary overflow-hidden grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
          isFocused && "",
          instance.isMaximized && "fixed top-2 left-2 right-2 bottom-14",
          instance.isMinimized && "hidden",
          instance.snapZone && "transition-all duration-200"
        )}
        style={{
          ...(!instance.isMaximized && {
            left: position.x,
            top: position.y,
            width: size.width,
            height: size.height,
          }),
          zIndex: order,
        }}
        tabIndex={0}
      >
        {/* Title Bar */}
        <WindowTitle
          instance={instance}
          title={appConfig.NAME}
          icon={React.createElement(appConfig.ICON)}
          zoom={zoomLevel}
          setZoom={setZoomLevel}
          size={size}
          setSize={setSize}
          setPosition={setPosition}
          snapZone={snapZone}
          setSnapZone={setSnapZone}
        />

        {/* Window Content */}
        <div className="overflow-hidden bg-background rounded-t-sm">
          <div
            className="h-full w-full overflow-auto @container"
            style={{
              zoom: zoomLevel,
            }}
          >
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader className="w-8 h-8 animate-spin animation-duration-[2.5s] text-primary" />
                </div>
              }
            >
              {instance.app}
            </React.Suspense>
          </div>
        </div>

        {!instance.isMaximized && !instance.snapZone && (
          <ResizeHandlers size={size} position={position} setSize={setSize} setPosition={setPosition} />
        )}
      </div>
    </>
  );
}

interface WindowTitleProps {
  instance: WindowInstance;
  title: string;
  icon?: React.ReactNode;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  size: Dimensions;
  setSize: (size: Dimensions) => void;
  setPosition: (position: Position) => void;
  snapZone: SnapZone;
  setSnapZone: (snapZone: SnapZone) => void;
}

function WindowTitle({
  instance,
  title,
  icon,
  zoom,
  setZoom,
  size,
  setSize,
  setPosition,
  snapZone,
  setSnapZone,
}: WindowTitleProps) {
  const dispatch = useWindowsActions();
  const bounds = useWindowsContainer();

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
      const { x, y, width, height } = calculateSnapPosition(snapZone, bounds);

      // Add a transition class to enable animation
      const windowEl = windowRef.current?.parentElement;
      if (windowEl) {
        windowEl.style.transition = "all 0.25s cubic-bezier(0.4,0,0.2,1)";
      }

      setSize({ width, height });
      setPosition({ x, y });

      // After transition ends, clean up the transition style
      if (windowEl) {
        const cleanup = () => {
          windowEl.style.transition = "";
          windowEl.removeEventListener("transitionend", cleanup);
        };
        windowEl.addEventListener("transitionend", cleanup);
      }
    }

    setIsDragging(false);
    setSnapZone(null);
    dragOffsetRef.current = {
      x: 0,
      y: 0,
    };
  }, [snapZone, setSnapZone, setSize, setPosition, bounds]);

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
        instance.isMaximized && "cursor-default",
        instance.snapZone && "cursor-grab"
      )}
      onMouseDown={instance.isMaximized ? undefined : handleMouseDown}
    >
      <div
        className="flex items-center space-x-2"
        onDoubleClick={() => dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id })}
      >
        <div className="flex items-center justify-center w-4 h-4">{icon}</div>
        <span className="text-sm font-medium">{title}</span>
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

interface ResizeHandlersProps {
  size: Dimensions;
  setSize: (size: Dimensions) => void;
  position: Position;
  setPosition: (position: Position) => void;
}

function ResizeHandlers({ size, setSize, position, setPosition }: ResizeHandlersProps) {
  const bounds = useWindowsContainer();

  const [start, setStart] = React.useState<{
    direction: ResizeDirection;
    pointer: Position;
    size: Dimensions;
    position: Position;
  } | null>(null);

  const handleResizeStart = (e: React.MouseEvent, direction: ResizeDirection) => {
    e.stopPropagation();
    setStart({
      direction,
      pointer: {
        x: e.clientX,
        y: e.clientY,
      },
      size: {
        width: size.width,
        height: size.height,
      },
      position: {
        x: position.x,
        y: position.y,
      },
    });
  };

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!start) return;

      const target = {
        x: e.clientX,
        y: e.clientY,
      };

      const { width, height, x, y } = calculateWindowResizeDirection(target, position, size, bounds, start);

      setSize({ width, height });
      setPosition({ x, y });
    },
    [start, position, size, bounds, setSize, setPosition]
  );

  const handleMouseUp = React.useCallback(() => {
    setStart(null);
  }, []);

  React.useEffect(() => {
    if (!start) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [start, handleMouseMove, handleMouseUp]);

  return (
    <>
      {/* Corner handles */}
      <div
        className="absolute -top-0.5 -left-0.5 w-3 h-3 cursor-nw-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "nw")}
      />
      <div
        className="absolute -top-0.5 -right-0.5 w-3 h-3 cursor-ne-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "ne")}
      />
      <div
        className="absolute -bottom-0.5 -left-0.5 w-3 h-3 cursor-sw-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "sw")}
      />
      <div
        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 cursor-se-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "se")}
      />

      {/* Side handles */}
      <div
        className="absolute -top-0.5 left-2.5 right-2.5 h-1 cursor-n-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "n")}
      />
      <div
        className="absolute -bottom-0.5 left-2.5 right-2.5 h-1 cursor-s-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "s")}
      />
      <div
        className="absolute -left-0.5 top-2.5 bottom-2.5 w-1 cursor-w-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "w")}
      />
      <div
        className="absolute -right-0.5 top-2.5 bottom-2.5 w-1 cursor-e-resize select-none"
        onMouseDown={(e) => handleResizeStart(e, "e")}
      />
    </>
  );
}
