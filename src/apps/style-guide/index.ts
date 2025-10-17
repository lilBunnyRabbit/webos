import type { WindowDefaults } from "@/contexts/windows";
import { Palette } from "lucide-react";
import React from "react";
import type { AppTag } from "@/contexts/apps";

export const ID = "style-guide";
export const NAME = "Style Guide";
export const ICON = Palette;
export const TAGS: AppTag[] = ["system"];

export const WINDOW_CONFIG: WindowDefaults = {
  size: {
    width: 943,
    height: 635,
  },
};

export const App = React.lazy(() => import("./style-guide.app"));

