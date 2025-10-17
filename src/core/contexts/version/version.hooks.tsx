import React from "react";
import { VersionContext } from "./version.context";

export const useVersion = () => {
  const context = React.useContext(VersionContext);

  if (!context) {
    throw new Error("useVersion must be used within a VersionProvider");
  }

  return context;
};