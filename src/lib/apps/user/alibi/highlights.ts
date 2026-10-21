import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ChatsCircle as ChatsCircleIcon, Files as FilesIcon, Scales as ScalesIcon } from "phosphor-svelte";

export default [
  {
    icon: ChatsCircleIcon,
    title: "Ask anything",
    text: "Question the suspect in your own words. The AI plays them from a story sheet and never sees the evidence.",
  },
  {
    icon: FilesIcon,
    title: "A new case every time",
    text: "Statements, people, times and evidence come from a seed, so a link can replay the same case.",
  },
  {
    icon: ScalesIcon,
    title: "Two accusations",
    text: "Pair a statement with the evidence that breaks it. Fewer questions and no wrong guesses score best.",
  },
] satisfies AppHighlight[];
