import React from "react";
import { WindowsActionsContext, WindowsContext } from "./windows.context";

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
