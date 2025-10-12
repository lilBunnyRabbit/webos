import type { WindowDefaults } from "@/contexts/windows";
import { FolderIcon } from "lucide-react";
import React from "react";

export const ID = "files";
export const NAME = "Files";
export const ICON = FolderIcon;

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 800,
    height: 600,
  },
};

export const App = React.lazy(() => import("./files.app"));
