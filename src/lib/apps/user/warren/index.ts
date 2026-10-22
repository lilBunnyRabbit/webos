import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "warren",
  name: "Warren",
  icon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  associations: [".warren", ".docx"],
  tools: [".md", ".markdown", "text/markdown"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  shell: () => import("./commands"),
  component: () => import("./warren.app.svelte"),
});
