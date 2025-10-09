import React from "react";
import { windowsReducer } from "./windows.reducer";
import { WindowsActionsContext, WindowsContext } from "./windows.context";
import { Window } from "@/components/window";
import { createPortal } from "react-dom";
import Apps from "@/apps";

interface WindowsProviderProps {
  children: React.ReactNode;
}

export const WindowsProvider: React.FC<WindowsProviderProps> = ({ children }) => {
  const [windows, dispatch] = React.useReducer(windowsReducer, {
    index: {},
    instances: [],
  });

  return (
    <WindowsActionsContext.Provider value={dispatch}>
      <WindowsContext.Provider value={windows}>{children}</WindowsContext.Provider>

      {windows.instances.map((windowId, index) => {
        const { app, ...instance } = windows.index[windowId];
        const appConfig = Apps[instance.appId];

        return (
          <React.Fragment key={windowId}>
            {createPortal(
              <Window
                instance={instance}
                title={appConfig.NAME}
                icon={React.createElement(appConfig.ICON)}
                order={index}
                isFocused={windows.instances[windows.instances.length - 1] === windowId}
              >
                {app}
              </Window>,
              document.body
            )}
          </React.Fragment>
        );
      })}
    </WindowsActionsContext.Provider>
  );
};
