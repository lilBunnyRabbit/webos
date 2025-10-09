import { useWindowsActions, type WindowInstance } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { Copy, Loader, Minus, RotateCcw, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { setGlobalSnapZone } from "@/contexts/windows/snap-indicator";
import { detectSnapZone } from "@/contexts/windows/windows.helpers";
import type { SnapZone } from "@/contexts/windows/windows.type";

// TODO: vibed

interface WindowProps {
  instance: WindowInstance;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isFocused: boolean;
  order: number;
}

export function Window({ instance, title, icon, children, isFocused, order }: WindowProps) {
  const dispatch = useWindowsActions();

  const [position, setPosition] = useState(
    instance.config.position ?? {
      x: 100,
      y: 100,
    }
  );
  const [size, setSize] = useState(
    instance.config.size ?? {
      width: 600,
      height: 400,
    }
  );
  const [zoomLevel, setZoomLevel] = useState(1);

  // Update position and size when instance config changes (e.g., from snapping)
  useEffect(() => {
    setPosition(instance.config.position);
    setSize(instance.config.size);
  }, [instance.config.position, instance.config.size]);

  // Handle browser window resize - ensure window stays within viewport
  useEffect(() => {
    const handleWindowResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

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
      } else if (position.x > viewportWidth - minVisibleWidth) {
        newX = viewportWidth - minVisibleWidth;
        needsUpdate = true;
      }

      if (position.y + size.height < titleBarHeight) {
        newY = titleBarHeight - size.height;
        needsUpdate = true;
      } else if (position.y > viewportHeight - titleBarHeight) {
        newY = viewportHeight - titleBarHeight;
        needsUpdate = true;
      }

      if (needsUpdate) {
        setPosition({ x: newX, y: newY });
      }
    };

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [position.x, position.y, size.width, size.height]);

  return (
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
        title={title}
        icon={icon}
        zoom={zoomLevel}
        setZoom={setZoomLevel}
        size={size}
        setPosition={setPosition}
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
            {children}
          </React.Suspense>
        </div>
      </div>

      {!instance.isMaximized && !instance.snapZone && (
        <ResizeHandlers size={size} position={position} setSize={setSize} setPosition={setPosition} />
      )}
    </div>
  );
}

interface WindowTitleProps {
  instance: WindowInstance;
  title: string;
  icon?: React.ReactNode;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  size: { width: number; height: number };
  setPosition: (position: { x: number; y: number }) => void;
}

function WindowTitle({ instance, title, icon, zoom, setZoom, size, setPosition }: WindowTitleProps) {
  const dispatch = useWindowsActions();

  const [isDragging, setIsDragging] = useState(false);
  const [currentSnapZone, setCurrentSnapZone] = useState<SnapZone>(null);

  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
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

    // Clear snap zone when starting to drag (unsnap the window)
    if (instance.snapZone) {
      dispatch({ type: "SNAP_WINDOW", windowId: instance.id, snapZone: null });
    }

    setIsDragging(true);
  }, [instance.snapZone, instance.id, dispatch]);

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      const parent = windowRef.current?.parentElement;
      if (!isDragging || !parent) return;

      // Detect snap zone based on cursor position
      const snapZone = detectSnapZone(e.clientX, e.clientY);
      setCurrentSnapZone(snapZone);
      setGlobalSnapZone(snapZone);

      // Calculate new position
      let newX = e.clientX - dragOffsetRef.current.x;
      let newY = e.clientY - dragOffsetRef.current.y;

      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Constrain X position - ensure at least 100px of window is visible
      const minVisibleWidth = 100;
      const maxX = viewportWidth - minVisibleWidth;
      const minX = -(size.width - minVisibleWidth);
      newX = Math.max(minX, Math.min(newX, maxX));

      // Constrain Y position - ensure title bar (40px) is always visible
      const titleBarHeight = 88;
      const maxY = viewportHeight - titleBarHeight;
      const minY = -(size.height - titleBarHeight);
      newY = Math.max(0, Math.max(minY, Math.min(newY, maxY)));

      setPosition({
        x: newX,
        y: newY,
      });
    },
    [isDragging, size, setPosition]
  );

  const handleMouseUp = React.useCallback(() => {
    if (currentSnapZone) {
      // Snap the window to the detected zone
      dispatch({ type: "SNAP_WINDOW", windowId: instance.id, snapZone: currentSnapZone });
    }

    setIsDragging(false);
    setCurrentSnapZone(null);
    setGlobalSnapZone(null);
  }, [currentSnapZone, dispatch, instance.id]);

  useEffect(() => {
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
      onDoubleClick={() => dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id })}
    >
      <div className="flex items-center space-x-2">
        <div className="flex items-center justify-center w-4 h-4">{icon}</div>
        <span className="text-sm font-medium">{title}</span>
      </div>

      <div className="flex items-center space-x-1">
        {/* Zoom Controls */}
        <div className="flex items-center space-x-1 mr-2 pl-2 border-l border-background">
          <button
            onClick={() => setZoom((prev) => Math.max(prev - 0.25, 0.25))}
            className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
            title="Zoom Out (Ctrl+-)"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="text-xs text-background min-w-[2rem] text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((prev) => Math.min(prev + 0.25, 3))}
            className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
            title="Zoom In (Ctrl++)"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
            title="Reset Zoom (Ctrl+0)"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Window Controls */}
        <button
          onClick={() => dispatch({ type: "TOGGLE_WINDOW", windowId: instance.id })}
          className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
          title="Minimize"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={() => dispatch({ type: "TOGGLE_MAXIMIZE_WINDOW", windowId: instance.id })}
          className="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors"
          title={instance.isMaximized ? "Restore" : "Maximize"}
        >
          {instance.isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={() => dispatch({ type: "DESTROY_WINDOW", windowId: instance.id })}
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
  size: { width: number; height: number };
  setSize: (size: { width: number; height: number }) => void;
  position: { x: number; y: number };
  setPosition: (position: { x: number; y: number }) => void;
}

function ResizeHandlers({ size, setSize, position, setPosition }: ResizeHandlersProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>("");
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, positionX: 0, positionY: 0 });

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      positionX: position.x,
      positionY: position.y,
    });
  };

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;

      let newWidth = size.width;
      let newHeight = size.height;
      let newX = position.x;
      let newY = position.y;

      // Minimum and maximum sizes
      const minWidth = 300;
      const minHeight = 200;
      const maxWidth = window.innerWidth - 40;
      const maxHeight = window.innerHeight - 80;

      // Handle different resize directions
      if (resizeDirection.includes("e")) {
        // East (right)
        newWidth = Math.min(maxWidth, Math.max(minWidth, resizeStart.width + deltaX));
      }
      if (resizeDirection.includes("w")) {
        // West (left)
        newWidth = Math.min(maxWidth, Math.max(minWidth, resizeStart.width - deltaX));
        newX = Math.max(0, resizeStart.positionX + deltaX);
      }
      if (resizeDirection.includes("s")) {
        // South (bottom)
        newHeight = Math.min(maxHeight, Math.max(minHeight, resizeStart.height + deltaY));
      }
      if (resizeDirection.includes("n")) {
        // North (top)
        newHeight = Math.min(maxHeight, Math.max(minHeight, resizeStart.height - deltaY));
        newY = Math.max(0, resizeStart.positionY + deltaY);
      }

      // Ensure window doesn't go outside viewport bounds
      if (newX + newWidth > window.innerWidth) {
        newWidth = window.innerWidth - newX;
      }
      if (newY + newHeight > window.innerHeight) {
        newHeight = window.innerHeight - newY;
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    },
    [isResizing, size, setSize, position, setPosition, resizeDirection, resizeStart]
  );

  const handleMouseUp = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

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
