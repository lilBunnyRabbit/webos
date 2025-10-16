import type { WindowDefaults } from "@/contexts/windows";
import { XIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/contexts/apps";

export const ID = "tic-tac-toe";
export const NAME = "Tic Tac Toe";
export const ICON = XIcon;
export const TAGS: AppTag[] = ["game"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 600,
    height: 600,
  },
};

export const App = React.lazy(() => import("./tic-tac-toe.app"));
