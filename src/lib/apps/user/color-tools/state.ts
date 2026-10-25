import {
  ArrowsLeftRight as ArrowsLeftRightIcon,
  CircleHalf as CircleHalfIcon,
  Eye as EyeIcon,
  Eyedropper as EyedropperIcon,
  Palette as PaletteIcon,
  ShareNetwork as ShareNetworkIcon,
} from "phosphor-svelte";
import { z } from "zod";
import { HueSpace, MAX_STEPS, MIN_STEPS } from "./harmony";
import { DEFAULT_MODEL } from "./models";

export const Section = {
  PICK: "pick",
  CONVERT: "convert",
  CONTRAST: "contrast",
  VISION: "vision",
  HARMONY: "harmony",
  PALETTE: "palette",
} as const;
export type Section = (typeof Section)[keyof typeof Section];

export const SECTIONS = [
  { value: Section.PICK, label: "Pick", icon: EyedropperIcon },
  { value: Section.CONVERT, label: "Convert", icon: ArrowsLeftRightIcon },
  { value: Section.CONTRAST, label: "Contrast", icon: CircleHalfIcon },
  { value: Section.VISION, label: "Vision", icon: EyeIcon },
  { value: Section.HARMONY, label: "Harmony", icon: ShareNetworkIcon },
  { value: Section.PALETTE, label: "Palette", icon: PaletteIcon },
];

export const VisionSource = { COLOR: "color", PALETTE: "palette" } as const;
export type VisionSource = (typeof VisionSource)[keyof typeof VisionSource];

export const DEFAULT_COLOR = "oklch(0.62 0.15 250)";
export const DEFAULT_BACKGROUND = "#ffffff";
export const DEFAULT_STEPS_TO = "oklch(0.85 0.12 90)";

// Each field falls back on its own, so one bad value doesn't reset the rest.
export const ToolsState = z.object({
  section: z.enum(Section).catch(Section.PICK),
  color: z.string().max(200).catch(DEFAULT_COLOR),
  model: z.string().max(40).catch(DEFAULT_MODEL),
  background: z.string().max(200).catch(DEFAULT_BACKGROUND),
  severity: z.number().min(0).max(1).catch(1),
  vision_source: z.enum(VisionSource).catch(VisionSource.COLOR),
  space: z.enum(HueSpace).catch(HueSpace.OKLCH),
  steps_to: z.string().max(200).catch(DEFAULT_STEPS_TO),
  steps: z.number().int().min(MIN_STEPS).max(MAX_STEPS).catch(7),
  palette: z.string().nullable().catch(null),
});
export type ToolsState = z.infer<typeof ToolsState>;

export function initial_state(path?: string): ToolsState {
  const state = ToolsState.parse({});
  return path ? { ...state, section: Section.PALETTE, palette: path } : state;
}
