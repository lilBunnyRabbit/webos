import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "style-guide",
  name: "Style Guide",
  meta: () => import("./meta"),
  icon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  defaults: {
    constraints: {
      width: { min: 720 },
      height: { min: 520 },
    },
  },
  component: () => import("./style-guide.app.svelte"),
});
