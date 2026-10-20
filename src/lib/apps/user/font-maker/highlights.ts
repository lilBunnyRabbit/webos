import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Export as ExportIcon, PenNib as PenNibIcon, Printer as PrinterIcon, TextAa as TextAaIcon } from "phosphor-svelte";

export default [
  { icon: PenNibIcon, title: "Draw every letter", text: "Write with a pen, finger or mouse on baseline and x-height guides; pen pressure sets the line weight." },
  { icon: PrinterIcon, title: "Print and scan", text: "Fill in a printed sheet by hand, photograph it, and trace over each letter in its box." },
  { icon: TextAaIcon, title: "Live preview", text: "Type a sample and see it in your font as you draw." },
  { icon: ExportIcon, title: "A real font", text: "Export a TrueType font that works in other apps, documents and Font Viewer." },
] satisfies AppHighlight[];
