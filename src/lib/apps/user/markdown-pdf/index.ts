import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { MARKDOWN_PDF_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "markdown-pdf",
  name: "Markdown to PDF",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Lay out a Markdown file as pages and save it as a PDF.",
  pitch: {
    problem: "Turning notes into a clean printable document takes a word processor.",
    solution: "Lay a Markdown file out as pages and save it as a PDF.",
  },
  keywords: ["markdown", "pdf", "print", "export", "document", "md", "write", "report", "convert"],
  tools: [".md", ".markdown", "text/markdown"],
  props: MARKDOWN_PDF_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  component: () => import("./markdown-pdf.app.svelte"),
});
