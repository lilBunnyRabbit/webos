import type { WindowDefaults } from "@/contexts/windows";
import { SettingsIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/contexts/apps";

export const ID = "settings";
export const NAME = "Settings";
export const ICON = SettingsIcon;
export const TAGS: AppTag[] = ["system"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 600,
    height: 420,
  },
};

export const App = React.lazy(() => import("./settings.app"));
