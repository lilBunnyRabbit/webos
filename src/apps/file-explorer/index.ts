import type { WindowDefaults } from "@/core/contexts/window-manager";
import { HardDriveIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/core/contexts/apps";

export const ID = "file-explorer";
export const NAME = "File Explorer";
export const ICON = HardDriveIcon;
export const TAGS: AppTag[] = ["system"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 900,
    height: 650,
  },
};

export const App = React.lazy(() => import("./file-explorer.app.tsx"));

