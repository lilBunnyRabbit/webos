import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Write app ideas as proposals with pictures right in the text, keep them in one notebook and send it on.",
  keywords: ["proposal", "idea", "pitch", "notebook", "notes", "feature request", "sketch", "screenshot", "pictures", "markdown", "send", "share"],
  pitch: {
    problem: "App ideas end up as loose notes, and a picture that explains them sits somewhere else.",
    solution: "A notebook of proposals that ask the right questions, with screenshots and sketches inside the sentences, sent as one file.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
