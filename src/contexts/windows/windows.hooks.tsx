import React from "react";
import { WindowsActionsContext, WindowsContainerContext, WindowsContext, WindowsFlagsContext } from "./windows.context";

export const useWindows = () => {
  const context = React.useContext(WindowsContext);
  if (!context) {
    throw new Error("useWindows must be used within a WindowsProvider");
  }

  return context;
};

export const useWindowsActions = () => {
  const context = React.useContext(WindowsActionsContext);
  if (!context) {
    throw new Error("useWindowsActions must be used within a WindowsProvider");
  }

  return context;
};

export const useWindowsContainer = () => {
  const context = React.useContext(WindowsContainerContext);
  if (!context) {
    throw new Error("useWindowsContainer must be used within a WindowsProvider");
  }

  return context;
};

export const useWindowsFlags = () => {
  const context = React.useContext(WindowsFlagsContext);
  if (!context) {
    throw new Error("useWindowsFlags must be used within a WindowsProvider");
  }

  return context;
};