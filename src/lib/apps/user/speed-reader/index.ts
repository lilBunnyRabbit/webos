import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "speed-reader",
  name: "Speed Reader",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  tools: ["text/plain", ".txt", ".md"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 300 } } },
  component: () => import("./speed-reader.app.svelte"),
});
