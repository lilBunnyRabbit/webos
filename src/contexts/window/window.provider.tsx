import { ResizeHandlers } from "@/components/core/window/resize-handlers";
import {
  type SnapZone,
  WindowFlag,
  type WindowInstance,
  calculateSnapPosition,
  calculateSnapPositionPreview,
  calculateWindowResize,
  useWindowsActions,
  useWindowsContainer,
} from "@/contexts/windows";
import { cn } from "@/lib/utils";
import React from "react";
import { WindowContext, WindowToolbarContext } from "./window.context";

export const WindowProvider = ({
  children,
  instance,
  order,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  instance: WindowInstance;
  order: number;
}) => {
  const bounds = useWindowsContainer();
  const dispatch = useWindowsActions();

  const isMinimized = instance.flags.has(WindowFlag.MINIMIZED);
  const isMaximized = instance.flags.has(WindowFlag.MAXIMIZED);

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
  const [snapZone, setSnapZone] = React.useState<SnapZone>(null);
  const [zoom, setZoom] = React.useState(1);

  const ref = React.useRef<HTMLDivElement>(null);

  const toSnapZone = React.useCallback(
    (snapZone: SnapZone) => {
      const { x, y, width, height } = calculateSnapPosition(snapZone, bounds);

      // Add a transition class to enable animation
      const element = ref.current;
      if (element) {
        element.style.transition = "all 0.25s cubic-bezier(0.4,0,0.2,1)";
      }

      setSize({ width, height });
      setPosition({ x, y });

      // After transition ends, clean up the transition style
      if (element) {
        const cleanup = () => {
          element.style.transition = "";
          element.removeEventListener("transitionend", cleanup);
        };
        element.addEventListener("transitionend", cleanup);
      }
    },
    [bounds]
  );

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
      <WindowContext.Provider value={{ position, setPosition, size, setSize, snapZone, setSnapZone, toSnapZone }}>
        <WindowToolbarContext.Provider value={{ zoom, setZoom }}>
          <div
            ref={ref}
            data-window-id={instance.id}
            onFocus={() => dispatch({ type: "FOCUS_WINDOW", windowId: instance.id })}
            className={cn("absolute overflow-hidden", className, isMinimized && "hidden")}
            style={{
              ...(isMaximized
                ? {
                    inset: 0,
                  }
                : {
                    left: position.x,
                    top: position.y,
                    width: size.width,
                    height: size.height,
                  }),
              zIndex: order,
            }}
            tabIndex={0}
          >
            {children}

            {!isMaximized && !isMinimized && !snapZone && (
              <ResizeHandlers size={size} position={position} setSize={setSize} setPosition={setPosition} />
            )}
          </div>
        </WindowToolbarContext.Provider>
      </WindowContext.Provider>

      {!isMaximized && !isMinimized && snapZone && (
        <div
          className="absolute pointer-events-none z-[9999] bg-primary/30 border-2 border-primary rounded-lg transition-all duration-150"
          style={calculateSnapPositionPreview(snapZone)}
        />
      )}
    </>
  );
};
