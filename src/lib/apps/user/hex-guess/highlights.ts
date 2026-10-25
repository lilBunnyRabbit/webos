import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ArrowsDownUp as ArrowsDownUpIcon, CalendarCheck as CalendarCheckIcon, Hash as HashIcon } from "phosphor-svelte";

export default [
  {
    icon: HashIcon,
    title: "Name the code",
    text: "See a colour and type the six hex digits you think make it; your last guess shows beside it.",
  },
  {
    icon: ArrowsDownUpIcon,
    title: "Higher or lower",
    text: "Every digit tells you whether the answer's is higher, lower or right, and you get five tries.",
  },
  {
    icon: CalendarCheckIcon,
    title: "A daily for everyone",
    text: "One colour a day, the same for everyone, plus endless practice and a link to challenge a friend.",
  },
] satisfies AppHighlight[];
