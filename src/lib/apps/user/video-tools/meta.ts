import type { AppMeta } from "$lib/core/api";

export default {
  description: "Trim a video to a WebM or MP4 clip, turn part of it into a GIF, or save its sound.",
  keywords: [
    "trim",
    "cut",
    "clip",
    "gif",
    "webm",
    "mp4",
    "h.264",
    "resize",
    "audio",
    "sound",
    "duplicate frames",
    "remove pauses",
    "dedupe",
    "timelapse",
  ],
  pitch: {
    problem: "Cutting a clip or making a GIF usually needs a video editor.",
    solution: "Trim a video, turn part of it into a GIF, or save its sound.",
  },
  example: "skip the pauses in a screen recording",
} satisfies AppMeta;
