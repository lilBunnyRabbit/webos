import type { AppMeta } from "$lib/core/api";

export default {
  description: "Draw furniture, rooms and fences as 3D lines at real lengths, then turn them to see every side.",
  keywords: [
    "3d",
    "wireframe",
    "furniture",
    "room",
    "plan",
    "lengths",
    "dimensions",
    "cavalier",
    "isometric",
    "sketch",
    "diy",
    "box",
  ],
  pitch: {
    problem:
      "A 3D line drawing in a drawing program is stuck at one angle, and lengths that run into the depth are hard to read.",
    solution:
      "Walk each line along X, Y or Z with a typed length, so the drawing is exact and to scale, then turn it any way you like with every length labelled.",
  },
  example: "plan a wardrobe under a sloped roof",
} satisfies AppMeta;
