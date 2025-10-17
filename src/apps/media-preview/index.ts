import type { WindowDefaults } from "@/core/contexts/window-manager";
import { ImageIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/core/contexts/apps";

export const ID = "media-preview";
export const NAME = "Media Preview";
export const ICON = ImageIcon;
export const TAGS: AppTag[] = ["utility"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 800,
    height: 600,
  },
};

export const App = React.lazy(() => import("./media-preview.app"));
