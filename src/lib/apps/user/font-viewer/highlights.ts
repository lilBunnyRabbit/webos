import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ArrowsOutLineVertical as ArrowsOutLineVerticalIcon, GridFour as GridFourIcon, SlidersHorizontal as SlidersHorizontalIcon, TextAa as TextAaIcon } from "phosphor-svelte";

export default [
  { icon: TextAaIcon, title: "Your own words", text: "Type any sample and see it in the font at the size you pick." },
  { icon: ArrowsOutLineVerticalIcon, title: "Waterfall", text: "The sample from caption to display size, all at once." },
  { icon: GridFourIcon, title: "Every character", text: "Letters, digits, accents and punctuation, with the missing ones marked." },
  { icon: SlidersHorizontalIcon, title: "Variable fonts", text: "Drag weight, width and every other axis the font has." },
] satisfies AppHighlight[];
