import type { AppMeta } from "$lib/core/api";

export default {
  description: "Question a suspect played by the on-device AI, then catch the one statement the evidence breaks.",
  keywords: ["alibi", "detective", "mystery", "suspect", "interrogation", "lie", "evidence", "ai", "game"],
  pitch: {
    problem: "Mystery games run out of cases, and their suspects only answer from a menu.",
    solution: "Ask a suspect anything in your own words and catch the lie; every case is new, and the AI never knows which line is false.",
  },
} satisfies AppMeta;
