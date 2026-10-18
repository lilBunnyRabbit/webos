import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ChatText as ChatTextIcon, PlayCircle as PlayCircleIcon, Shuffle as ShuffleIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: PlayCircleIcon, title: "Step through it", text: "Play, pause, step back and scrub through every comparison, with the pseudocode line lit as it runs." },
  { icon: ChatTextIcon, title: "Every step explained", text: "Each step says in plain words what happened and why, with live counters for comparisons and writes." },
  { icon: ShuffleIcon, title: "Your input", text: "Type an input, roll a random one, or pick a preset like already sorted or reversed to see best and worst cases." },
  { icon: TerminalIcon, title: "algo list, algo", text: "List every algorithm with its complexity, or open one with an input from the Terminal." },
] satisfies AppHighlight[];
