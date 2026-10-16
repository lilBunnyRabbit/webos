import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { CalendarCheck as CalendarCheckIcon, ChartBar as ChartBarIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";

export default [
  { icon: SquaresFourIcon, title: "Game library", text: "Every game in one place, sorted by recent, name or most played." },
  { icon: CalendarCheckIcon, title: "Daily puzzles", text: "Today's puzzles, the same for everyone, with your streak." },
  { icon: ChartBarIcon, title: "Stats", text: "Play time, sessions and dailies solved, in total and per game." },
] satisfies AppHighlight[];
