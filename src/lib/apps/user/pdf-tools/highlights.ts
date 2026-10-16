import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Files as FilesIcon, Images as ImagesIcon, PenNib as PenNibIcon, Scissors as ScissorsIcon } from "phosphor-svelte";

export default [
  { icon: FilesIcon, title: "Merge and organize", text: "Combine PDFs, then reorder, rotate, insert or delete pages." },
  { icon: ScissorsIcon, title: "Split", text: "Split a PDF into single pages, page ranges or every few pages." },
  { icon: PenNibIcon, title: "Sign", text: "Draw a signature once, save it and place it on any page." },
  { icon: ImagesIcon, title: "Images in and out", text: "Turn images into a PDF, or save every page as an image." },
] satisfies AppHighlight[];
