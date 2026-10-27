import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Watch a camera for motion: clips from just before to just after, a notification, and a timeline of the day.",
  keywords: ["motion", "camera", "security", "cctv", "webcam", "detector", "surveillance", "pet cam", "clips", "watch"],
  pitch: {
    problem: "You want to know what happened in a room while you were away, without watching hours of video.",
    solution: "It watches the camera and keeps a short clip of every movement, starting a few seconds before it.",
  },
  authors: [OWNER],
} satisfies AppMeta;
