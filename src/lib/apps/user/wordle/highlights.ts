import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Calculator as CalculatorIcon, SquaresFour as SquaresFourIcon, TextAa as TextAaIcon } from "phosphor-svelte";

export default [
  {
    icon: TextAaIcon,
    title: "Five, six or seven letters",
    text: "Classic Wordle at three lengths, with hard mode and a daily word.",
  },
  {
    icon: SquaresFourIcon,
    title: "More boards",
    text: "Dordle, Quordle and Octordle: every guess goes on every board.",
  },
  {
    icon: CalculatorIcon,
    title: "Twists",
    text: "Nerdle's equations, Absurdle's dodging word and Survival's run of words.",
  },
] satisfies AppHighlight[];
