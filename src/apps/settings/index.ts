import { SettingsIcon } from "lucide-react";
import React from "react";

export const ID = "settings";
export const NAME = "Settings";
export const ICON = SettingsIcon;

export const CONFIG = {
  size: {
    width: 600,
    height: 420,
  },
};

export const App = React.lazy(() => import("./settings.app"));
