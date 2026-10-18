import type { AppMeta } from "$lib/core/api";

export default {
  description: "Tournament brackets for game night: knockout, double elimination, round robin or a race cup.",
  keywords: [
    "tournament",
    "bracket",
    "knockout",
    "elimination",
    "round robin",
    "league",
    "cup",
    "mario kart",
    "game night",
    "standings",
  ],
  pitch: {
    problem: "Running a game-night tournament on paper gets messy fast.",
    solution: "Make knockout, double elimination, round robin or race-cup brackets and track every result.",
  },
} satisfies AppMeta;
