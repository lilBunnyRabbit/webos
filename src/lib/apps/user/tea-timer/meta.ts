import type { AppMeta } from "$lib/core/api";

export default {
  description: "Brew tea right: presets with temperature and time, a strength for each cup, re-steeps and your own teas.",
  keywords: ["tea", "timer", "brew", "steep", "green tea", "black tea", "herbal", "kettle", "infusion", "cup"],
  pitch: {
    problem: "Every tea wants its own water temperature and steeping time, and the packet is in the bin.",
    solution: "Pick the tea and a strength, and it rings when the cup is ready, again for every steep.",
  },
} satisfies AppMeta;
