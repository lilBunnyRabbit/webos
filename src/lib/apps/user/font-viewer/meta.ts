import type { AppMeta } from "$lib/core/api";

export default {
  description: "Previews TTF, OTF and WOFF fonts: sample text, sizes, every character and variable axes.",
  keywords: ["font", "typeface", "ttf", "otf", "woff", "woff2", "glyph", "type", "specimen", "variable"],
  pitch: {
    problem: "You can't tell what a font file looks like from its name.",
    solution: "Preview any TTF, OTF or WOFF font with sample text, every character and its axes.",
  },
} satisfies AppMeta;
