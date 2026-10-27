import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Camera as CameraIcon, FilePdf as FilePdfIcon, Selection as SelectionIcon, SlidersHorizontal as SlidersHorizontalIcon } from "phosphor-svelte";

export default [
  { icon: CameraIcon, title: "Snap a page", text: "Take a photo or pick one; the page's edges are found for you." },
  { icon: SelectionIcon, title: "Fix the corners", text: "Drag a corner with a magnifier beside your finger to line it up." },
  { icon: SlidersHorizontalIcon, title: "Clean it up", text: "Keep the colour, turn it gray, or black and white with shadows gone." },
  { icon: FilePdfIcon, title: "One PDF", text: "Put the pages in order and save them as one PDF." },
] satisfies AppHighlight[];
