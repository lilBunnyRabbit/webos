import type { AppId } from "@/apps";
import type React from "react";

export type WindowId = string;

export interface WindowInstance {
  id: WindowId;
  appId: AppId;
  createdAt: Date;
  isMinimized: boolean;
  isMaximized: boolean;
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
    };
