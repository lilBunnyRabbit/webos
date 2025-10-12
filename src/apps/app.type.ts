import type { Dimensions, WindowFlag } from "@/contexts/windows";
import type { Flags } from "@/lib/flags";
import type React from "react";

export interface AppConfig {
  ID: string;
  NAME: string;
  ICON: React.ComponentType<{ className?: string }>;
  CONFIG?: {
    size?: Dimensions;
    flags?: Flags<WindowFlag>;
  };

  App: React.LazyExoticComponent<() => React.JSX.Element>;
}
