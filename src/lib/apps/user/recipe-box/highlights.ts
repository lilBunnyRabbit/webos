import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { CookingPot as CookingPotIcon, Scales as ScalesIcon, Table as TableIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: ScalesIcon, title: "Scale and convert", text: "Cook for any number of people and read amounts in metric or imperial." },
  { icon: CookingPotIcon, title: "Cook mode", text: "One step at a time in big type, timers a tap away, and the screen stays on." },
  { icon: TableIcon, title: "Recipe as a table", text: "See which ingredients each step combines, flowing right to the finished dish." },
  { icon: TerminalIcon, title: "recipe scale", text: "Get the shopping list for any number of servings in the Terminal." },
] satisfies AppHighlight[];
