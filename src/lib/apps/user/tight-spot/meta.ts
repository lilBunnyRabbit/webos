import type { AppMeta } from "$lib/core/api";

export default {
  description: "Top-down driving games around one yard, with cars that steer like real ones. Inside: Tight Spot, parking from kerbside gaps to tight garage doors; the Warehouse, moving pallets with a rear-steering forklift; and a playground to try every vehicle.",
  keywords: ["game", "car", "parking", "driving", "simulator", "physics", "daily", "levels", "tight spot", "hub", "playground", "forklift", "warehouse", "pallets", "mower", "lawn"],
  pitch: {
    problem: "Parking games let the car turn on the spot, so nothing you learn carries over to the real thing.",
    solution: "Vehicles that pivot on their rear axle with a real turning circle, in a yard you drive around to pick a game or try a bus, a van or a trailer.",
  },
} satisfies AppMeta;
