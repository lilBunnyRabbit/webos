import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Turn your handwriting into a font: draw each letter in its box, or print a sheet and scan it, then export a TrueType font.",
  keywords: ["font", "handwriting", "typeface", "ttf", "truetype", "lettering", "calligraphy", "glyph", "scan", "template", "type design"],
  pitch: {
    problem: "Making a font from your own handwriting usually means an online service or heavy type design software.",
    solution: "Draw or scan each letter into a box and export a working TrueType font, all in the browser.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
