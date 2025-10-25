import type { Flags } from "$lib/core/utils/flags";
export type WindowId = string;

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type Bounds = Position & Dimensions;

export const WindowFlag = {
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
} as const;

export type WindowFlag = (typeof WindowFlag)[keyof typeof WindowFlag];

export type SnapZone = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom";


export interface WindowInstance {
  id: WindowId;
  // app: AppInstance;
  createdAt: Date;
  flags: Flags<WindowFlag>;
  // snapZone: SnapZone;
  tmp__content: string;
  bounds: Bounds;
  snapZone: SnapZone | null;
  zIndex: number;
}