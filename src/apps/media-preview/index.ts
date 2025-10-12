import type { WindowDefaults } from "@/contexts/windows";
import { ImageIcon } from "lucide-react";
import React from "react";

export const ID = "media-preview";
export const NAME = "Media Preview";
export const ICON = ImageIcon;

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 800,
    height: 600,
  },
};

export const App = React.lazy(() => import("./media-preview.app"));
