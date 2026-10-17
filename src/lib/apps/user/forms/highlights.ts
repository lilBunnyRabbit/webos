import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ChartBar as ChartBarIcon, LinkSimple as LinkSimpleIcon, ListChecks as ListChecksIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: ListChecksIcon, title: "Forms as text", text: "Write a form as a Markdown checklist and watch it take shape as you type." },
  { icon: LinkSimpleIcon, title: "No server", text: "The whole form travels inside its link, and the answers come back as a link too." },
  { icon: ChartBarIcon, title: "Compare answers", text: "Keep every answer in a file beside the form, compare them side by side and export a CSV." },
  { icon: TerminalIcon, title: "form link", text: "Get a form's link in the Terminal, ready to paste." },
] satisfies AppHighlight[];
