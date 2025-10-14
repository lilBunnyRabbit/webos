import type { Flags } from "@/lib/flags";
import type { Order } from "@/lib/order";
import type { AppInstance } from "../apps";

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

export type WindowFlag = (typeof WindowFlag)[keyof typeof WindowFlag];

export interface WindowDefaults {
  position?: Position;
  size?: Dimensions;
  flags?: Flags<WindowFlag>;
  snapZone?: SnapZone;
}

export interface WindowInstance {
  id: WindowId;
  app: AppInstance;
  createdAt: Date;
  flags: Flags<WindowFlag>;
  snapZone: SnapZone;
  config: {
    position: Position;
    size: Dimensions;
  };
}

export interface WindowsState {
  index: Record<WindowId, WindowInstance>;
  order: Order<WindowId>;
}

export type WindowsAction =
  | {
      type: "CREATE_WINDOW";
      app: AppInstance;
      defaults?: WindowDefaults;
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
    }
  | {
      type: "SET_SNAP_ZONE";
      windowId: WindowId;
      snapZone: SnapZone;
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
