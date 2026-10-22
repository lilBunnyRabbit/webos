import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "text-editor",
  name: "Text Editor",
  icon,
  version: "2.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  associations: ["text/*", ".md", ".json", ".ts", ".js", ".svelte", ".yaml", ".yml", ".toml", ".ini", ".log", ".env"],
  tools: [".http", ".rest", ".cook", ".fdsl"],
  props: FILE_PROPS,
  component: () => import("./text-editor.app.svelte"),
});
