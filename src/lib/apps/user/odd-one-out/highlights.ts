import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { CalendarCheck as CalendarCheckIcon, Eye as EyeIcon, Timer as TimerIcon } from "phosphor-svelte";

export default [
  {
    icon: EyeIcon,
    title: "One tile is off",
    text: "Tap the tile that's a shade lighter, darker or duller; the grid grows and the difference fades as you go.",
  },
  {
    icon: TimerIcon,
    title: "Sixty seconds",
    text: "Find as many as you can in a minute; a wrong tap costs three seconds.",
  },
  {
    icon: CalendarCheckIcon,
    title: "A daily for everyone",
    text: "The same boards for everyone each day, plus endless practice and a link to challenge a friend.",
  },
] satisfies AppHighlight[];
