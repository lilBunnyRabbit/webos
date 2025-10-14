import { ActivityIcon } from "lucide-react";
import React from "react";

export const ID = "profiler";
export const NAME = "Profiler";
export const ICON = ActivityIcon;

export const App = React.lazy(() => import("./profiler.app"));
