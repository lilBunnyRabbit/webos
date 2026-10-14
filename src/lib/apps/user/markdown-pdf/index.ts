import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";

export default define_app({
  id: "markdown-pdf",
  name: "Markdown to PDF",
  icon: FilePdfIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Lay out a Markdown file as pages and save it as a PDF.",
  keywords: ["markdown", "pdf", "print", "export", "document", "md"],
  tools: [".md", ".markdown", "text/markdown"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 320 } } },
  component: () => import("./markdown-pdf.app.svelte"),
});
