import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Box a moving subject in a video and keep it still in the middle while the world moves around it.",
  keywords: ["track", "tracking", "follow", "stabilize", "subject", "bird", "lock", "video", "webm"],
  pitch: {
    problem: "A bird in flight darts all over the frame, so you never get a good look at it.",
    solution: "Draw a box around it once, and the video follows it, holding it still in the middle.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
