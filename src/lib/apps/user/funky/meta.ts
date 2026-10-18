import type { AppMeta } from "$lib/core/api";

export default {
  description: "Write SimplePlanes Funky Trees as code, simulate it, and copy setters and part inputs.",
  keywords: ["simpleplanes", "funky trees", "autopilot", "pid", "craft"],
  pitch: {
    problem: "Writing Funky Trees in SimplePlanes is fiddly without feedback.",
    solution: "Write them as code, simulate the result and copy the setters into the game.",
  },
} satisfies AppMeta;
