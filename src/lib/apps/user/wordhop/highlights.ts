import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Calculator as CalculatorIcon, SquaresFour as SquaresFourIcon, TextAa as TextAaIcon } from "phosphor-svelte";

export default [
  {
    icon: TextAaIcon,
    title: "Five, six or seven letters",
    text: "The classic word guess at three lengths, with hard mode and a daily word.",
  },
  {
    icon: SquaresFourIcon,
    title: "More boards",
    text: "Two, four or eight boards: every guess goes on every board.",
  },
  {
    icon: CalculatorIcon,
    title: "Twists",
    text: "Math equations, a Dodge word that changes to escape you, and Survival's run of words.",
  },
] satisfies AppHighlight[];
