import { Window } from "@/core/components/window";
import React from "react";
import {
  WindowManagerActionsContext,
  WindowManagerContainerContext,
  WindowManagerContext,
  WindowManagerFlagsContext,
  type WindowManagerContainerContextProps,
} from "./window-manager.context";
import { getElementBounds } from "@/core/lib/windows";
import { useWindowManager } from "./window-manager.hooks";
import { windowManagerReducer } from "./window-manager.reducer";
import { Order } from "@/core/lib/order";
import type { WindowId, WindowManagerFlag } from "./window-manager.type";
import { Flags } from "@/core/lib/flags";

export const WindowManagerProvider = ({ children }: React.PropsWithChildren) => {
  const [windows, dispatch] = React.useReducer(windowManagerReducer, {
    flags: new Flags<WindowManagerFlag>(),
    index: {},
    order: new Order<WindowId>(),
  });

  // INSERT_YOUR_CODE

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Example: handle ctrl + arrow keys globally for window management
      if (e.altKey) {
        switch (e.key) {
          case "ArrowDown":
            dispatch({ type: "MINIMIZE_ALL_WINDOWS" });
            e.preventDefault();
            break;
          case "ArrowUp":
            dispatch({ type: "RESTORE_ALL_WINDOWS" });
            e.preventDefault();
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch]);

  return (
    <WindowManagerFlagsContext.Provider value={windows.flags}>
      <WindowManagerActionsContext.Provider value={dispatch}>
        <WindowManagerContext.Provider value={windows}>{children}</WindowManagerContext.Provider>
      </WindowManagerActionsContext.Provider>
    </WindowManagerFlagsContext.Provider>
  );
};

export const WINDOW_MANAGER_CONTAINER_ID = "desktop";

export const WindowManagerContainerProvider = ({
  children,
  className,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  const [bounds, setBounds] = React.useState<WindowManagerContainerContextProps>(() => getElementBounds(null));

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    setBounds(getElementBounds(element));

    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      const element = ref.current;
      if (!element) return;

      setBounds(getElementBounds(element));
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <WindowManagerContainerContext.Provider value={bounds}>
      <div ref={ref} id={WINDOW_MANAGER_CONTAINER_ID} className={className} style={style}>
        {children}
        <WindowManagerRenderer />
      </div>
    </WindowManagerContainerContext.Provider>
  );
};

const WindowManagerRenderer = () => {
  const { index } = useWindowManager();

  return Object.entries(index).map(([windowId, instance]) => {
    return <Window key={windowId} instance={instance} />;
  });
};
