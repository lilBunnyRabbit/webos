import { useWindowsActions, useWindowsContainer, type WindowInstance } from "@/contexts/windows";
import { calculateSnapPositionPreview, calculateWindowResize } from "@/contexts/windows/windows.helpers";
import type { SnapZone } from "@/contexts/windows/windows.type";
import { cn } from "@/lib/utils";
import { Loader } from "lucide-react";
import React from "react";
import { ResizeHandlers } from "./resize-handlers";
import { WindowTitle } from "./window-title";

interface WindowProps {
  instance: WindowInstance & { app: React.ReactNode };
  isFocused: boolean;
  order: number;
}

export function Window({ instance, isFocused, order }: WindowProps) {
  const dispatch = useWindowsActions();
  const bounds = useWindowsContainer();

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
