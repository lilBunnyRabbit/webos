import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ArrowsClockwise as ArrowsClockwiseIcon, FileDoc as FileDocIcon, Files as FilesIcon, TextAa as TextAaIcon } from "phosphor-svelte";

export default [
  { icon: TextAaIcon, title: "The basics, done well", text: "Headings, bold, italic, sizes and lists, with the word and character count always in view." },
  { icon: FilesIcon, title: "Real pages", text: "A4, Letter or A5 sheets with page breaks where you put them, or one long page." },
  { icon: ArrowsClockwiseIcon, title: "Change everywhere", text: "Pick a word and swap every use of it at once, and see which words you lean on too often." },
  { icon: FileDocIcon, title: "Word in, Word and PDF out", text: "Open a .docx to keep working on it, save one that opens in Word, or print straight to PDF." },
] satisfies AppHighlight[];
