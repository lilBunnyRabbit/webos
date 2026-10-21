import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Cpu as CpuIcon, Images as ImagesIcon, Timer as TimerIcon } from "phosphor-svelte";

export default [
  {
    icon: TimerIcon,
    title: "Six words, twenty seconds",
    text: "Each round deals six things to draw. The AI guesses as you go, and a right guess moves you on.",
  },
  {
    icon: CpuIcon,
    title: "Guessed on this device",
    text: "Chrome's built-in model looks at your drawing; nothing leaves the computer.",
  },
  {
    icon: ImagesIcon,
    title: "Keep your drawings",
    text: "The round ends with every drawing and the AI's last guess, each one saved as a PNG if you like it.",
  },
] satisfies AppHighlight[];
