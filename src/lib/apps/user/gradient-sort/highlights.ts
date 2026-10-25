import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ArrowsLeftRight as ArrowsLeftRightIcon, CalendarCheck as CalendarCheckIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";

export default [
  {
    icon: SquaresFourIcon,
    title: "A scrambled gradient",
    text: "Four corner colours blend across the board; the corners and a few edge tiles stay put as your guide.",
  },
  {
    icon: ArrowsLeftRightIcon,
    title: "Swap to sort",
    text: "Drag a tile onto another, or tap two, to swap them; Hard is a bigger board with only the corners locked.",
  },
  {
    icon: CalendarCheckIcon,
    title: "A daily for everyone",
    text: "One gradient a day, the same for everyone, ranked by time, plus endless practice and a challenge link.",
  },
] satisfies AppHighlight[];
