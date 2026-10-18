import type { AppMeta } from "$lib/core/api";

export default {
  description: "Trim a video to a WebM clip, turn part of it into a GIF, or save its sound.",
  keywords: ["trim", "cut", "clip", "gif", "webm", "audio", "sound"],
  pitch: {
    problem: "Cutting a clip or making a GIF usually needs a video editor.",
    solution: "Trim a video, turn part of it into a GIF, or save its sound.",
  },
} satisfies AppMeta;
