import type { AppMeta } from "$lib/core/api";

export default {
  description: "Plays an audio file and draws it live as bars, a waveform or a circle.",
  keywords: ["audio", "music", "spectrum", "waveform", "oscilloscope", "microphone", "sound", "visualiser"],
  pitch: {
    problem: "Music sounds good, but you want to see it too.",
    solution: "Play an audio file and watch it drawn live as bars, a waveform or a circle.",
  },
} satisfies AppMeta;
