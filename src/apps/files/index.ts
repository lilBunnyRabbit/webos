import type { WindowDefaults } from "@/core/contexts/window-manager";
import { FolderIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/core/contexts/apps";

export const ID = "files";
export const NAME = "Files";
export const ICON = FolderIcon;
export const TAGS: AppTag[] = ["system"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 800,
    height: 600,
  },
};

export const App = React.lazy(() => import("./files.app"));
