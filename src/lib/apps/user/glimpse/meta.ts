import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "A camera that forgets: quick photos as a double check, erased by themselves after an hour, a day, three days or a week.",
  keywords: ["camera", "photo", "temporary", "disposable", "throwaway", "expire", "erase", "double check", "torch", "flash", "gallery"],
  pitch: {
    problem: "You photograph the locked door to be sure, and the photo sits in your gallery forever.",
    solution: "Snap it here, a few times if you like; the photos erase themselves when their time is up.",
  },
  authors: [OWNER],
} satisfies AppMeta;
