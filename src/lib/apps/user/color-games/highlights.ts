import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  CalendarCheck as CalendarCheckIcon,
  Eye as EyeIcon,
  Palette as PaletteIcon,
  SquaresFour as SquaresFourIcon,
} from "phosphor-svelte";

export default [
  {
    icon: PaletteIcon,
    title: "Recall",
    text: "Five colours flash by; rebuild each from memory with sliders and see how close you got, side by side.",
  },
  {
    icon: EyeIcon,
    title: "Odd one out",
    text: "Tap the one tile that's a shade off, as the grid grows and the difference fades, for sixty seconds.",
  },
  {
    icon: SquaresFourIcon,
    title: "Gradient sort and Hex guess",
    text: "Put a scrambled gradient back in order, or name a colour's hex code in five tries with higher and lower hints.",
  },
  {
    icon: CalendarCheckIcon,
    title: "A daily for each",
    text: "Every game has one puzzle a day, the same for everyone, plus endless practice and a link to challenge a friend.",
  },
] satisfies AppHighlight[];
