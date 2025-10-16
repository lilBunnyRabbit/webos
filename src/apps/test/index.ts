import { TestTubeIcon } from "lucide-react";
import React from "react";
import type { AppTag } from "@/contexts/apps";

export const ID = "test";
export const NAME = "Test";
export const ICON = TestTubeIcon;
export const TAGS: AppTag[] = ["utility"];

export const App = React.lazy(() => import("./test.app"));
