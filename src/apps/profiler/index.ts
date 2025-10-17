import { ActivityIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/core/contexts/apps";

export const ID = "profiler";
export const NAME = "Profiler";
export const ICON = ActivityIcon;
export const TAGS: AppTag[] = ["system"];

export const App = React.lazy(() => import("./profiler.app"));
