import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ChatCircleText as ChatCircleTextIcon, Database as DatabaseIcon, FileText as FileTextIcon, ShieldCheck as ShieldCheckIcon } from "phosphor-svelte";

export default [
  { icon: DatabaseIcon, title: "About your apps", text: "Ask what's on your shopping list or calendar. You choose what it may read, and it only reads." },
  { icon: FileTextIcon, title: "About your file", text: "Open a note, a log or some code and ask what it says, in plain words." },
  { icon: ChatCircleTextIcon, title: "Answers as they're written", text: "The answer streams in; stop it any time, or start a new chat." },
  { icon: ShieldCheckIcon, title: "Stays on this device", text: "Chrome's built-in AI runs locally after a one-time download, offline too." },
] satisfies AppHighlight[];
