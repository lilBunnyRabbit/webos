import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { MARKDOWN_PDF_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "markdown-pdf",
  name: "Markdown to PDF",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  tools: [".md", ".markdown", "text/markdown"],
  props: MARKDOWN_PDF_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  component: () => import("./markdown-pdf.app.svelte"),
});
