import type { WindowDefaults } from "@/core/contexts/window-manager";
import { SettingsIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/core/contexts/apps";

export const ID = "settings";
export const NAME = "Settings";
export const ICON = SettingsIcon;
export const TAGS: AppTag[] = ["system"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 943,
    height: 635,
  },
};

export const App = React.lazy(() => import("./settings.app"));
