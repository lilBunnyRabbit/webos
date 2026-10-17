import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { NotePencil as NotePencilIcon } from "phosphor-svelte";

export default define_app({
  id: "text-editor",
  name: "Text Editor",
  icon: NotePencilIcon,
  version: "2.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Edit text and code files, with highlighting for common formats.",
  keywords: ["text", "code", "notepad", "editor", "viewer", "markdown", "json", "write", "document"],
  associations: ["text/*", ".md", ".json", ".ts", ".js", ".svelte", ".yaml", ".yml", ".toml", ".ini", ".log", ".env"],
  tools: [".http", ".rest"],
  props: FILE_PROPS,
  component: () => import("./text-editor.app.svelte"),
});
