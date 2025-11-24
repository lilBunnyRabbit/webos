import type { IService } from "../../api.type";
import { Flags } from "$lib/core/utils/flags";
import type { Bounds, PartialRecord } from "$lib/core/utils/type";

export type WindowId = string;

export const WindowFlag = {
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
} as const;
export type WindowFlag = (typeof WindowFlag)[keyof typeof WindowFlag];

export const SnapZone = {
  TOP: "top",
  BOTTOM: "bottom",
  LEFT: "left",
  RIGHT: "right",
  TOP_LEFT: "top-left",
  TOP_RIGHT: "top-right",
  BOTTOM_LEFT: "bottom-left",
  BOTTOM_RIGHT: "bottom-right",
} as const;
export type SnapZone = (typeof SnapZone)[keyof typeof SnapZone];

export type WindowConstraints = PartialRecord<"width" | "height", PartialRecord<"min" | "max", number>>;

export interface WindowInstance {
  id: WindowId;
  created_at: Date;
  order: number;
  flags: Flags<WindowFlag>;
  snapZone: SnapZone | null;
  constraints: WindowConstraints;
  bounds: Bounds;
}

export interface WindowOpenOptions {}
