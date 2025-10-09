import type { AppId } from "@/apps";
import type React from "react";

export type WindowId = string;

export type SnapZone = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;

export interface WindowInstance {
  id: WindowId;
  appId: AppId;
  createdAt: Date;
  isMinimized: boolean;
  isMaximized: boolean;
  snapZone: SnapZone;
  config: {
    position: {
      x: number;
      y: number;
    };
    size: {
      width: number;
      height: number;
    };
  };
}

export interface WindowsState {
  index: Record<WindowId, WindowInstance & { app: React.ReactNode }>;
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
      type: "SNAP_WINDOW";
      windowId: WindowId;
      snapZone: SnapZone;
    };
