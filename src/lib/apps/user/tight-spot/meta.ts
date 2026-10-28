import type { AppMeta } from "$lib/core/api";

export default {
  description: "A top-down parking game with a car that steers like a real one: parallel, garages, pillars, narrow aisles and more.",
  keywords: ["game", "car", "parking", "driving", "simulator", "physics", "daily", "levels"],
  pitch: {
    problem: "Parking games let the car turn on the spot, so nothing you learn carries over to the real thing.",
    solution: "A car that pivots on its rear axle with a real turning circle, in generated spots from kerbside gaps to tight garage doors.",
  },
} satisfies AppMeta;
