import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Optimise SVGs with SVGO, compare them before and after, export PNGs and turn them into Svelte components.",
  keywords: [
    "svg",
    "svgo",
    "optimize",
    "optimise",
    "minify",
    "vector",
    "icon",
    "png",
    "export",
    "svelte",
    "component",
    "compress",
  ],
  pitch: {
    problem: "SVGs from design tools are bloated and awkward to use in code.",
    solution: "Optimise them, compare before and after, export PNGs and turn them into Svelte components.",
  },
} satisfies AppMeta;
