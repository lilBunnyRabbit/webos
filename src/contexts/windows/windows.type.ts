import type { AppId } from "@/apps";
import type { Flags } from "@/lib/flags";
import type React from "react";

export type WindowId = string;

export type SnapZone =
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | null;

export const WindowFlag = {
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
} as const;

export type WindowFlag = typeof WindowFlag[keyof typeof WindowFlag];

export interface WindowInstance {
  id: WindowId;
  appId: AppId;
  createdAt: Date;
  flags: Flags<WindowFlag>;
  config: {
    position: Position;
    size: Dimensions;
  };
}

export interface WindowInstanceWithApp extends WindowInstance {
  $app: React.ReactNode;
}

export interface WindowsState {
  index: Record<WindowId, WindowInstanceWithApp>;
  instances: WindowId[];
}

export type WindowsAction =
  | {
      type: "CREATE_WINDOW";
      appId: AppId;
    }
  | {
      type: "DESTROY_WINDOW";
      windowId: WindowId;
    }
  | {
      type: "FOCUS_WINDOW";
      windowId: WindowId;
    }
  | {
      type: "TOGGLE_WINDOW";
      windowId: WindowId;
    }
  | {
      type: "TOGGLE_MAXIMIZE_WINDOW";
      windowId: WindowId;
    }
  | {
      type: "MINIMIZE_ALL_WINDOWS";
    };

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type Bounds = Position & Dimensions;

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
