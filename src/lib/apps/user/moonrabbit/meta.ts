import type { AppMeta } from "$lib/core/api";

export default {
  description: "A journal locked with a passphrase, quick to write in.",
  keywords: ["journal", "diary", "dear diary", "private", "locked", "encrypted", "password", "gratitude", "reflection", "night journal", "moon"],
  pitch: {
    problem: "A diary only works if nobody else can read it and writing a line takes seconds.",
    solution: "Everything is encrypted on your device; unlock with a phrase, a passkey, a hop path or a PIN and write.",
  },
} satisfies AppMeta;
