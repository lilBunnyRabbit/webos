import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ChatCircleSlash as ChatCircleSlashIcon, Sparkle as SparkleIcon, Trophy as TrophyIcon } from "phosphor-svelte";

export default [
  {
    icon: ChatCircleSlashIcon,
    title: "Five words you can't say",
    text: "Every card bans five words. A clue that uses one, or the word itself, is stopped before it's sent.",
  },
  {
    icon: SparkleIcon,
    title: "The AI guesses",
    text: "After each clue, AI running on this device makes three guesses and remembers the ones that were wrong.",
  },
  {
    icon: TrophyIcon,
    title: "Fewest clues wins",
    text: "Five cards a round. Each clue costs a point and a pass costs three, so a low round is a good one.",
  },
] satisfies AppHighlight[];
