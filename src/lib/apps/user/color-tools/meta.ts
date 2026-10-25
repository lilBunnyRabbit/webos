import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Pick a colour from the screen, a photo or the camera, see it in 70 colour models, check text contrast, preview colour blindness, build harmonies and save palettes.",
  keywords: [
    "color",
    "colour",
    "picker",
    "eyedropper",
    "convert",
    "oklch",
    "hex",
    "rgb",
    "hsl",
    "lab",
    "contrast",
    "wcag",
    "accessibility",
    "color blindness",
    "protanopia",
    "deuteranopia",
    "tritanopia",
    "harmony",
    "complementary",
    "palette",
    "swatches",
    "chromatics",
  ],
  pitch: {
    problem: "Checking one colour means a picker site, a converter, a contrast checker and a blindness simulator.",
    solution: "One window shares one colour across picking, 70 models, WCAG contrast, colour-blind previews, harmonies and palettes.",
  },
} satisfies AppMeta;
