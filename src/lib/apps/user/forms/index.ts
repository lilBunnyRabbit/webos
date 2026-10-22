import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FORMS_PROPS } from "./props";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "forms",
  name: "Forms",
  icon,
  version: "1.1.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  associations: [".form.md", ".answers"],
  props: FORMS_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./forms.app.svelte"),
});
