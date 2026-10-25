import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Match a colour with the sliders of a different colour model each round, from HSL to CAM16 and ACES, and collect all 70 models in an atlas.",
  keywords: ["color", "colour", "model", "space", "oklch", "lab", "hsl", "cmyk", "sliders", "match", "atlas", "collection", "daily", "game"],
  pitch: {
    problem: "Colour models are names in a dropdown; few people have ever steered one.",
    solution: "Five rounds, five models, one target each: dial it in, see how close you got, and fill an atlas of all 70.",
  },
} satisfies AppMeta;
