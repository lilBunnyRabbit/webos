import React from "react";
import { WindowContext, WindowToolbarContext } from "./window.context";

export const useWindow = () => {
  const context = React.useContext(WindowContext);
  if (!context) {
    throw new Error("useWindow must be used within a WindowProvider");
  }

  return context;
};

export const useWindowToolbar = () => {
  const context = React.useContext(WindowToolbarContext);
  if (!context) {
    throw new Error("useWindowToolbar must be used within a WindowProvider");
  }

  return context;
};
