import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { MARKDOWN_PDF_PROPS } from "./props";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "markdown-pdf",
  name: "Markdown to PDF",
  icon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  tools: [".md", ".markdown", "text/markdown"],
  props: MARKDOWN_PDF_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  component: () => import("./markdown-pdf.app.svelte"),
});
