import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ArrowsIn as ArrowsInIcon, Code as CodeIcon, FileImage as FileImageIcon, SquareHalf as SquareHalfIcon } from "phosphor-svelte";

export default [
  { icon: ArrowsInIcon, title: "Optimise", text: "Run an SVG through SVGO, pick what it may change and see how many bytes it saves." },
  { icon: SquareHalfIcon, title: "Before and after", text: "Zoom both side by side on light, dark or a checkerboard, and see any pixel that changed." },
  { icon: FileImageIcon, title: "PNG export", text: "Save sharp PNGs at the sizes you pick." },
  { icon: CodeIcon, title: "Svelte component", text: "Copy or save the SVG as a component with size and colour props." },
] satisfies AppHighlight[];
