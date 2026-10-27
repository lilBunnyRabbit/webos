import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Photograph pages at any angle; Doc Scan finds their edges, straightens them and saves them as one PDF.",
  keywords: ["scan", "scanner", "document", "pdf", "camera", "photo", "page", "paper", "receipt", "straighten", "perspective", "deskew", "black and white"],
  pitch: {
    problem: "A photo of a page comes out skewed, shadowed and full of the table around it.",
    solution: "Find the page's edges, straighten it, clean it up and save the pages as one PDF.",
  },
  authors: [OWNER],
} satisfies AppMeta;
