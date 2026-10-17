import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { CalendarCheck as CalendarCheckIcon, Detective as DetectiveIcon, Password as PasswordIcon } from "phosphor-svelte";

export default [
  {
    icon: PasswordIcon,
    title: "One clue per guess",
    text: "Each guess reports only how many digits sit in their right place, never which ones.",
  },
  {
    icon: DetectiveIcon,
    title: "Three to seven digits",
    text: "Pick the code length, and every case keeps an intercept log of your guesses.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Daily case",
    text: "The same four-digit code for everyone each day, ranked by the fewest guesses.",
  },
] satisfies AppHighlight[];
