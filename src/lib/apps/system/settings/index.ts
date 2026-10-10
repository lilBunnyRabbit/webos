import { define_app } from "$lib/core/api";
import { Gear as GearIcon } from "phosphor-svelte";

export default define_app({
  id: "settings",
  name: "Settings",
  icon: GearIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./settings.app.svelte"),
});
