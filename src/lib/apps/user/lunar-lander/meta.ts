import type { AppMeta } from "$lib/core/api";

export default {
  description: "A side-view lander sim at real scale. Fly a lander, twin pods or a heavy shuttle on the Moon, Mars and Earth through 15 missions, a random mission and a daily, or around the base.",
  keywords: ["game", "rocket", "space", "lander", "moon", "mars", "physics", "simulator", "daily"],
  pitch: {
    problem: "Most lander games are a tap on a button and a points score.",
    solution: "A throttle lever, real gravity, thrusters that fight the ship's inertia, and legs that take only so hard a touchdown.",
  },
  example: "hover over the crater and set the lander down at a kiss",
  experimental: true,
} satisfies AppMeta;
