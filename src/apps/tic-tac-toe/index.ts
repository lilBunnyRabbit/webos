import { XIcon } from "lucide-react";
import React from "react";

export const ID = "tic-tac-toe";
export const NAME = "Tic Tac Toe";
export const ICON = XIcon;

export const CONFIG = {
  size: {
    width: 600,
    height: 600,
  },
};

export const App = React.lazy(() => import("./tic-tac-toe.app"));
