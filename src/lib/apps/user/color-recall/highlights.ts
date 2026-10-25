import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { CalendarCheck as CalendarCheckIcon, Palette as PaletteIcon, Sliders as SlidersIcon } from "phosphor-svelte";

export default [
  {
    icon: PaletteIcon,
    title: "Five colours",
    text: "Each colour shows for five seconds, or two on Hard; then it's gone and you rebuild it from memory.",
  },
  {
    icon: SlidersIcon,
    title: "HSB or OKLCH",
    text: "Rebuild it with hue, saturation and brightness sliders, or OKLCH's, and see yours beside the real one.",
  },
  {
    icon: CalendarCheckIcon,
    title: "A daily for everyone",
    text: "One set of colours a day, the same for everyone, plus endless practice and a link to challenge a friend.",
  },
] satisfies AppHighlight[];
