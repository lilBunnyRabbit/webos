import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ChartBar as ChartBarIcon, LinkSimple as LinkSimpleIcon, ListChecks as ListChecksIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: ListChecksIcon, title: "Forms as text", text: "Write a form as a Markdown checklist and watch it take shape as you type." },
  { icon: LinkSimpleIcon, title: "No server", text: "The whole form travels inside its link, and each answer comes back as a short code." },
  { icon: ChartBarIcon, title: "Paste, then see", text: "Paste an answer code and it lands beside the right form. A summary per question, side by side, or a CSV." },
  { icon: TerminalIcon, title: "form link, form answer", text: "Get a form's link, or save an answer code, from the Terminal." },
] satisfies AppHighlight[];
