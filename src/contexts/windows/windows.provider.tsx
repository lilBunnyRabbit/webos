import { Window } from "@/components/core/window/window";
import React from "react";
import {
  WindowsActionsContext,
  WindowsContainerContext,
  WindowsContext,
  type WindowsContainerContextProps,
} from "./windows.context";
import { getElementBounds } from "./windows.helpers";
import { useWindows } from "./windows.hooks";
import { windowsReducer } from "./windows.reducer";
import { Order } from "@/lib/order";
import type { WindowId } from "./windows.type";

export const WindowsProvider = ({ children }: React.PropsWithChildren) => {
  const [windows, dispatch] = React.useReducer(windowsReducer, {
    index: {},
    order: new Order<WindowId>(),
  });

  return (
    <WindowsActionsContext.Provider value={dispatch}>
      <WindowsContext.Provider value={windows}>{children}</WindowsContext.Provider>
    </WindowsActionsContext.Provider>
  );
};

export const WINDOWS_CONTAINER_ID = "desktop";

export const WindowsContainerProvider = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  const [bounds, setBounds] = React.useState<WindowsContainerContextProps>(() => getElementBounds(ref.current));

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
    <WindowsContainerContext.Provider value={bounds}>
      <div ref={ref} id={WINDOWS_CONTAINER_ID} className={className}>
        {children}
        <WindowsRenderer />
      </div>
    </WindowsContainerContext.Provider>
  );
};

const WindowsRenderer = () => {
  const { index } = useWindows();

  return Object.entries(index).map(([windowId, instance]) => {
    return <Window key={windowId} instance={instance} />;
  });
};
