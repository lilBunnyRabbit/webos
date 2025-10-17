import React from "react";
import { WindowManagerActionsContext, WindowManagerContainerContext, WindowManagerContext, WindowManagerFlagsContext } from "./window-manager.context";

export const useWindowManager = () => {
  const context = React.useContext(WindowManagerContext);
  if (!context) {
    throw new Error("useWindows must be used within a WindowsProvider");
  }

  return context;
};

export const useWindowManagerActions = () => {
  const context = React.useContext(WindowManagerActionsContext);
  if (!context) {
    throw new Error("useWindowsActions must be used within a WindowsProvider");
  }

  return context;
};

export const useWindowManagerContainer = () => {
  const context = React.useContext(WindowManagerContainerContext);
  if (!context) {
    throw new Error("useWindowsContainer must be used within a WindowsProvider");
  }

  return context;
};

export const useWindowManagerFlags = () => {
  const context = React.useContext(WindowManagerFlagsContext);
  if (!context) {
    throw new Error("useWindowsFlags must be used within a WindowsProvider");
  }

  return context;
};