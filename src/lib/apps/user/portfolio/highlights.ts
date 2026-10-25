import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  Compass as CompassIcon,
  EnvelopeSimple as EnvelopeSimpleIcon,
  SquaresFour as SquaresFourIcon,
  TerminalWindow as TerminalWindowIcon,
} from "phosphor-svelte";

export default [
  { icon: TerminalWindowIcon, title: "A guided tour", text: "A terminal types the tour and opens each window in turn. Type to take over, or search with /." },
  { icon: SquaresFourIcon, title: "Work and side projects", text: "Every role on one timeline, and side projects that play a short animation of what they do." },
  { icon: CompassIcon, title: "How I build", text: "Pick a principle and the jobs and projects that show it light up." },
  { icon: EnvelopeSimpleIcon, title: "Get in touch", text: "Write a message that opens in your mail app, or use LinkedIn and GitHub." },
] satisfies AppHighlight[];
