import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Write letters, CVs and stories on real pages, with headings, lists and page breaks, then save them for Word or as a PDF.",
  keywords: ["word processor", "document", "writer", "cv", "resume", "letter", "docx", "word", "pdf", "rich text", "headings", "page break", "thesaurus", "word count"],
  pitch: {
    problem: "Writing a CV or a letter shouldn't need a paid word processor.",
    solution: "A free page to write on, with the basics done well and a Word file or a PDF at the end.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
