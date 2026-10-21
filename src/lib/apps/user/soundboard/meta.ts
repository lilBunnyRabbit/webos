import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "A grid of pads that play your own sounds, by click or key.",
  keywords: ["sound", "audio", "pads", "sfx", "effects", "board", "music", "meme", "buttons", "video", "clip"],
  pitch: {
    problem: "The right sound at the right moment needs to be one press away.",
    solution: "A grid of pads that play your own sounds by click or key.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
