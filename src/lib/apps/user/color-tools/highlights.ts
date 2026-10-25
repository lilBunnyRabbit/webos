import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  ArrowsLeftRight as ArrowsLeftRightIcon,
  CircleHalf as CircleHalfIcon,
  Eyedropper as EyedropperIcon,
  Palette as PaletteIcon,
} from "phosphor-svelte";

export default [
  { icon: EyedropperIcon, title: "Pick from anywhere", text: "Take a colour off the screen, a photo or the camera, with a magnifier on the exact pixel, or type it in any syntax." },
  { icon: ArrowsLeftRightIcon, title: "Every model", text: "The same colour in all 70 models, from hex and OKLCH to CAM16, ACES and CMYK, each one ready to copy." },
  { icon: CircleHalfIcon, title: "Contrast and vision", text: "WCAG contrast with AA and AAA badges, and how a colour or palette looks with protan, deutan or tritan vision." },
  { icon: PaletteIcon, title: "Harmonies and palettes", text: "Complements, triads, ramps and steps between two colours, saved as a .palette file in Documents." },
] satisfies AppHighlight[];
