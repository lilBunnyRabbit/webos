import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "A side-view takeoff and landing sim. Taxi out of the hangar, take off from a grass-edged runway, fly a circuit and bring a taildragger back down gently.",
  keywords: ["game", "plane", "flight", "simulator", "aviation", "landing", "takeoff", "airfield", "physics", "taildragger"],
  pitch: {
    problem: "Most flying games fly for you: the plane goes where you point it and never stalls.",
    solution: "A real wing that stalls, floats in ground effect and needs a flare, flown from a side view at real scale.",
  },
  example: "take off, fly a circuit and grease the landing",
  authors: [OWNER],
  experimental: true,
} satisfies AppMeta;
