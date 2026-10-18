import type { AppMeta } from "$lib/core/api";

export default {
  description: "Plays animated GIFs with pause, frame-by-frame stepping and speed control.",
  keywords: ["gif", "animation", "frames", "player", "image", "animated"],
  pitch: {
    problem: "A GIF loops too fast to see the moment you care about.",
    solution: "Pause it, step through it frame by frame and change the speed.",
  },
} satisfies AppMeta;
