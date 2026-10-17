import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Bandaids as BandaidsIcon, Crop as CropIcon, Eraser as EraserIcon, FilmStrip as FilmStripIcon, Stack as StackIcon } from "phosphor-svelte";

export default [
  { icon: EraserIcon, title: "Remove background", text: "Pick the colours to drop and get a transparent copy." },
  { icon: StackIcon, title: "Join images", text: "Stack images or line them up side by side, with gaps and a background." },
  { icon: CropIcon, title: "Trim and split", text: "Trim away transparent borders, or cut an image into square tiles." },
  { icon: FilmStripIcon, title: "Sprite sheets", text: "Slice a sheet into frames and preview the animation, or pack frames into an atlas." },
  { icon: BandaidsIcon, title: "Patch", text: "Lay the original under an edited copy and paint back the parts an editor stamped over." },
] satisfies AppHighlight[];
