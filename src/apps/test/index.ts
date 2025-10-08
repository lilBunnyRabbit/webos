import { TestTubeIcon } from "lucide-react";
import React from "react";

export const ID = "test";
export const NAME = "Test";
export const ICON = TestTubeIcon;

export const App = React.lazy(() => import("./test.app"));
