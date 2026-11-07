import type { AppMeta } from "$lib/core/api";

export default {
  description: "A top-down boat docking sim. Sail around a small harbour, through a gate to pick a level, and bring a RIB or a yacht alongside or into a box berth without a bump.",
  keywords: ["game", "boat", "docking", "harbour", "marina", "sailing", "yacht", "physics", "simulator", "daily", "levels"],
  pitch: {
    problem: "Driving games stop when you let go; a boat doesn't, and that's the whole skill.",
    solution: "A boat with momentum, a rudder that needs flow and a prop that walks astern, docked gently onto fenders in a harbour you sail around.",
  },
  example: "bring a yacht alongside between two moored boats",
  experimental: true,
} satisfies AppMeta;
