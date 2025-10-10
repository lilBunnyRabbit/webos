import {
  calculateWindowResizeDirection,
  useWindowsContainer,
  type Dimensions,
  type Position,
  type ResizeDirection,
} from "@/contexts/windows";
import React from "react";

interface ResizeHandlersProps {
  size: Dimensions;
  setSize: (size: Dimensions) => void;
  position: Position;
  setPosition: (position: Position) => void;
}

export function ResizeHandlers({ size, setSize, position, setPosition }: ResizeHandlersProps) {
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
