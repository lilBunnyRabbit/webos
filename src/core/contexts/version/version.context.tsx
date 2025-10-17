import React from "react";
import type { VersionInfo } from "./version.type";
import type { RefetchOptions } from "@tanstack/react-query";

export type VersionContextProps = {
  newVersion: VersionInfo | null;
  checkForUpdates: (options?: RefetchOptions) => void;
  isCheckingForUpdates: boolean;
  isUpdating: boolean;
  applyUpdate: () => void;
};

export const VersionContext = React.createContext<VersionContextProps | null>(null);
