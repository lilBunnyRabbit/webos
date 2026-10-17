import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";
import { MARKDOWN_PDF_PROPS } from "./props";

export default define_app({
  id: "markdown-pdf",
  name: "Markdown to PDF",
  icon: FilePdfIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Lay out a Markdown file as pages and save it as a PDF.",
  keywords: ["markdown", "pdf", "print", "export", "document", "md", "write", "report", "convert"],
  tools: [".md", ".markdown", "text/markdown"],
  props: MARKDOWN_PDF_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  component: () => import("./markdown-pdf.app.svelte"),
});
